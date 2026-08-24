#!/usr/bin/env python3
"""Rebuild odm.json: per-year 21x21 OD matrices.
2018 = measured (od2018.json, Pitoski et al. 2021 CC BY, aggregated from municipal edges).
Other years = IPF: 2018 structure rescaled to exact DZS margins from atlas_data2.json
(rows = oi 'odseljeni u drugu zupaniju', cols = ii 'doseljeni iz druge zupanije').
1998-2006 margins don't balance (DZS asymmetry, max 550) -> in-margins rescaled proportionally.
Integer rounding: largest remainder per row (rows exact; col drift <= ~5)."""
import json, numpy as np
ISOS=[f'HR-{i:02d}' for i in range(1,22)]
od=json.load(open('ref/od2018.json', encoding='utf-8'))
atlas=json.load(open('../../src/data/atlas_data2.json', encoding='utf-8'))
YRS=atlas['years']; C=atlas['c']; n=21
seed=np.zeros((n,n))
for i,a in enumerate(ISOS):
    for j,b in enumerate(ISOS):
        if a!=b: seed[i,j]=od.get(a,{}).get(b,0)
OUT={a:{} for a in ISOS}
for yi,y in enumerate(YRS):
    r=np.array([C[a]['oi'][yi] for a in ISOS],float)
    c=np.array([C[a]['ii'][yi] for a in ISOS],float)
    # The docstring promises this rescale and its size; neither was reported, so
    # the only way to know either was to instrument the script. A DZS
    # republication that widens the asymmetry, or introduces one in a recent
    # year, was absorbed in silence — and odm's per-county in-flow column then
    # contradicts the `ii` that atlas_data2 feeds the same screen (the legend and
    # the tooltip read `ii`, the Tokovi arcs read odm), which is the 146-person
    # disagreement the app shows at 2002 for Grad Zagreb.
    gap=r.sum()-c.sum()
    if abs(gap)>1e-9:
        c=c*(r.sum()/c.sum())
        print(f'  {y}: in-margins rescaled, r-c = {gap:+.0f}')
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
    # …and the column bound the docstring states, which nothing enforced. Rows are
    # exact by construction (largest remainder is applied per row); the columns
    # are what rounding is free to move, and 'col drift <= ~5' was an assertion
    # in prose only. Measured over all 28 years: max 4,07 per county, 16-27 in
    # total per year.
    cdev=abs(Mi.sum(0)-c)
    assert cdev.max()<=5,(y,'col dev',float(cdev.max()))
    if cdev.max()>0:
        print(f'  {y}: col drift max {cdev.max():.2f}, total {cdev.sum():.0f}')
    for i,a in enumerate(ISOS):
        for j,b in enumerate(ISOS):
            v=int(Mi[i,j])
            if v>0: OUT[a].setdefault(b,[0]*len(YRS))[yi]=v
json.dump(OUT,open('../../src/data/odm.json', 'w', encoding='utf-8'),separators=(',',':'))
print('odm.json rebuilt')
