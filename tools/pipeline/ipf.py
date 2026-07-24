#!/usr/bin/env python3
"""Rebuild odm.json: per-year 21x21 OD matrices.
2018 = measured (od2018.json, Pitoski et al. 2021 CC BY, aggregated from municipal edges).
Other years = IPF: 2018 structure rescaled to exact DZS margins from atlas_data2.json
(rows = oi 'odseljeni u drugu zupaniju', cols = ii 'doseljeni iz druge zupanije').
1998-2006 margins don't balance (DZS asymmetry, max 550) -> in-margins rescaled proportionally.
Integer rounding: largest remainder per row (rows exact; col drift <= ~5)."""
import json, numpy as np
ISOS=[f'HR-{i:02d}' for i in range(1,22)]
od=json.load(open('../../src/data/od2018.json'))
atlas=json.load(open('../../src/data/atlas_data2.json'))
YRS=atlas['years']; C=atlas['c']; n=21
seed=np.zeros((n,n))
for i,a in enumerate(ISOS):
    for j,b in enumerate(ISOS):
        if a!=b: seed[i,j]=od.get(a,{}).get(b,0)
OUT={a:{} for a in ISOS}
for yi,y in enumerate(YRS):
    r=np.array([C[a]['oi'][yi] for a in ISOS],float)
    c=np.array([C[a]['ii'][yi] for a in ISOS],float)
    if abs(r.sum()-c.sum())>1e-9: c=c*(r.sum()/c.sum())
    if y==2018:
        Mi=seed.astype(int)
    else:
        M=seed*(r.sum()/seed.sum())
        for _ in range(1000):
            rs=M.sum(1); rs[rs==0]=1; M*=(r/rs)[:,None]
            cs=M.sum(0); cs[cs==0]=1; M*=(c/cs)[None,:]
            if max(abs(M.sum(1)-r).max(),abs(M.sum(0)-c).max())<1e-7: break
        R=np.floor(M).astype(int)
        for i in range(n):
            need=int(round(r[i]))-int(R[i].sum())
            if need>0:
                idx=np.argsort(-(M[i]-R[i]))
                for k in idx[:need]: R[i,k]+=1
        Mi=R
    assert int(abs(Mi.sum(1)-r).max())==0,(y,'row dev')
    for i,a in enumerate(ISOS):
        for j,b in enumerate(ISOS):
            v=int(Mi[i,j])
            if v>0: OUT[a].setdefault(b,[0]*len(YRS))[yi]=v
json.dump(OUT,open('../../src/data/odm.json','w'),separators=(',',':'))
print('odm.json rebuilt')
