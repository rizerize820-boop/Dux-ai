"""Dux Mini GPT — кішкентай GPT-ні нөлден үйрету (PyTorch, байт деңгейінде).

Байт деңгейі (UTF-8) = кез келген тіл мен код қолдау табады, сөздік тек 256.

Үйрету:   python train.py train data.txt [қадам_саны]
Сөйлесу:  python train.py gen "Сәлем"
"""
import math
import os
import sys
import time

import torch
import torch.nn as nn
import torch.nn.functional as F

CKPT = 'dux-mini.pt'
CFG = dict(
    block=256,      # контекст ұзындығы (байт)
    n_layer=6,
    n_head=6,
    n_embd=384,     # ~11 млн параметр, Colab T4-те үйренеді
    dropout=0.1,
)
BATCH = 64
LR = 3e-4
device = 'cuda' if torch.cuda.is_available() else 'cpu'


class Attention(nn.Module):
    def __init__(self, c):
        super().__init__()
        self.h = c['n_head']
        self.qkv = nn.Linear(c['n_embd'], 3 * c['n_embd'])
        self.proj = nn.Linear(c['n_embd'], c['n_embd'])
        self.drop = c['dropout']

    def forward(self, x):
        B, T, C = x.shape
        q, k, v = self.qkv(x).split(C, dim=2)
        q, k, v = [t.view(B, T, self.h, C // self.h).transpose(1, 2) for t in (q, k, v)]
        y = F.scaled_dot_product_attention(
            q, k, v, is_causal=True, dropout_p=self.drop if self.training else 0.0
        )
        return self.proj(y.transpose(1, 2).contiguous().view(B, T, C))


class Block(nn.Module):
    def __init__(self, c):
        super().__init__()
        self.ln1 = nn.LayerNorm(c['n_embd'])
        self.attn = Attention(c)
        self.ln2 = nn.LayerNorm(c['n_embd'])
        self.mlp = nn.Sequential(
            nn.Linear(c['n_embd'], 4 * c['n_embd']),
            nn.GELU(),
            nn.Linear(4 * c['n_embd'], c['n_embd']),
            nn.Dropout(c['dropout']),
        )

    def forward(self, x):
        x = x + self.attn(self.ln1(x))
        return x + self.mlp(self.ln2(x))


class GPT(nn.Module):
    def __init__(self, c):
        super().__init__()
        self.c = c
        self.tok = nn.Embedding(256, c['n_embd'])
        self.pos = nn.Embedding(c['block'], c['n_embd'])
        self.blocks = nn.Sequential(*[Block(c) for _ in range(c['n_layer'])])
        self.ln = nn.LayerNorm(c['n_embd'])
        self.head = nn.Linear(c['n_embd'], 256, bias=False)
        self.head.weight = self.tok.weight  # салмақты бөлісу

    def forward(self, idx, targets=None):
        B, T = idx.shape
        x = self.tok(idx) + self.pos(torch.arange(T, device=idx.device))
        logits = self.head(self.ln(self.blocks(x)))
        loss = None
        if targets is not None:
            loss = F.cross_entropy(logits.view(-1, 256), targets.view(-1))
        return logits, loss

    @torch.no_grad()
    def generate(self, idx, n=300, temperature=0.8, top_k=40):
        for _ in range(n):
            logits, _ = self(idx[:, -self.c['block']:])
            logits = logits[:, -1, :] / max(temperature, 1e-4)
            if top_k:
                v, _ = torch.topk(logits, top_k)
                logits[logits < v[:, [-1]]] = -float('inf')
            nxt = torch.multinomial(F.softmax(logits, dim=-1), 1)
            idx = torch.cat([idx, nxt], dim=1)
        return idx


def encode(text):
    return torch.tensor(list(text.encode('utf-8')), dtype=torch.long)


def decode(ids):
    return bytes(int(i) for i in ids).decode('utf-8', errors='replace')


def train(path, steps):
    data = torch.tensor(list(open(path, 'rb').read()), dtype=torch.long)
    if len(data) < CFG['block'] + 2:
        sys.exit('Мәтін тым қысқа. Көбірек мәтін беріңіз (кемі бірнеше жүз КБ).')
    cut = int(0.9 * len(data))
    train_d, val_d = data[:cut], data[cut:]
    if len(val_d) < CFG['block'] + 2:
        val_d = train_d
    print(f'Мәтін: {len(data):,} байт, құрылғы: {device}')

    def batch(d):
        ix = torch.randint(len(d) - CFG['block'] - 1, (BATCH,))
        x = torch.stack([d[i:i + CFG['block']] for i in ix])
        y = torch.stack([d[i + 1:i + CFG['block'] + 1] for i in ix])
        return x.to(device), y.to(device)

    model = GPT(CFG).to(device)
    print(f'Параметр саны: {sum(p.numel() for p in model.parameters()) / 1e6:.1f} млн')
    opt = torch.optim.AdamW(model.parameters(), lr=LR, weight_decay=0.1)
    amp = device == 'cuda'
    scaler = torch.amp.GradScaler('cuda', enabled=amp)

    @torch.no_grad()
    def evaluate():
        model.eval()
        out = {}
        for name, d in (('train', train_d), ('val', val_d)):
            ls = []
            for _ in range(20):
                x, y = batch(d)
                with torch.autocast(device, dtype=torch.float16, enabled=amp):
                    ls.append(model(x, y)[1].item())
            out[name] = sum(ls) / len(ls)
        model.train()
        return out

    t0 = time.time()
    for step in range(steps + 1):
        lr = LR * 0.5 * (1 + math.cos(math.pi * step / steps)) if step > 100 else LR * step / 100
        for g in opt.param_groups:
            g['lr'] = lr
        if step % 250 == 0:
            e = evaluate()
            print(f"қадам {step}: train {e['train']:.3f}  val {e['val']:.3f}  ({time.time() - t0:.0f}с)")
            torch.save({'cfg': CFG, 'model': model.state_dict()}, CKPT)
        x, y = batch(train_d)
        with torch.autocast(device, dtype=torch.float16, enabled=amp):
            _, loss = model(x, y)
        opt.zero_grad(set_to_none=True)
        scaler.scale(loss).backward()
        scaler.unscale_(opt)
        torch.nn.utils.clip_grad_norm_(model.parameters(), 1.0)
        scaler.step(opt)
        scaler.update()
    torch.save({'cfg': CFG, 'model': model.state_dict()}, CKPT)
    print('Дайын:', CKPT)


def gen(prompt, n=400):
    if not os.path.exists(CKPT):
        sys.exit('Алдымен үйретіңіз: python train.py train data.txt')
    ck = torch.load(CKPT, map_location=device)
    model = GPT(ck['cfg']).to(device)
    model.load_state_dict(ck['model'])
    model.eval()
    idx = encode(prompt).unsqueeze(0).to(device)
    print(decode(model.generate(idx, n)[0].tolist()))


if __name__ == '__main__':
    a = sys.argv[1:]
    if len(a) >= 2 and a[0] == 'train':
        train(a[1], int(a[2]) if len(a) > 2 else 3000)
    elif len(a) >= 2 and a[0] == 'gen':
        gen(a[1])
    else:
        print(__doc__)
