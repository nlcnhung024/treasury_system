import sys
sys.stdout.reconfigure(encoding='utf-8')

def layout_treemap(items, x, y, w, h):
    if not items:
        return []
    total = sum(it['value'] for it in items)
    if total <= 0:
        return []
    
    if len(items) == 1:
        return [{'x': x, 'y': y, 'w': w, 'h': h, **items[0]}]
    
    half_sum = total / 2.0
    running = 0.0
    split_idx = 1
    best_diff = abs(total)
    
    for i, it in enumerate(items):
        running += it['value']
        diff = abs(running - half_sum)
        if diff < best_diff:
            best_diff = diff
            split_idx = i + 1
        elif i > 0 and running > half_sum:
            break
            
    group1 = items[:split_idx]
    group2 = items[split_idx:]
    if not group2:
        group1 = items[:-1]
        group2 = items[-1:]
        
    sum1 = sum(it['value'] for it in group1)
    sum2 = sum(it['value'] for it in group2)
    
    if w >= h:
        w1 = w * (sum1 / total)
        w2 = w - w1
        res1 = layout_treemap(group1, x, y, w1, h)
        res2 = layout_treemap(group2, x + w1, y, w2, h)
    else:
        h1 = h * (sum1 / total)
        h2 = h - h1
        res1 = layout_treemap(group1, x, y, w, h1)
        res2 = layout_treemap(group2, x, y + h1, w, h2)
        
    return res1 + res2

items1 = [
    {'name': 'Doanh nghiệp vay vốn MB', 'value': 48805525000, 'pct': 43.0},
    {'name': 'CTCP XI MANG SUNRISE', 'value': 44505016000, 'pct': 39.2},
    {'name': 'CTCP TM VA PT HUONG GIANG', 'value': 20192321197, 'pct': 17.8},
]
rects1 = layout_treemap(items1, 0, 0, 100, 100)
print('--- Rects 1 (Card 1) ---')
for r in rects1:
    print(f"{r['name']}: x={r['x']:.1f}%, y={r['y']:.1f}%, w={r['w']:.1f}%, h={r['h']:.1f}%")

items2 = [
    {'name': 'MBB (MB)', 'value': 68997846197, 'pct': 60.8},
    {'name': 'CTG (VietinBank)', 'value': 30355015000, 'pct': 26.7},
    {'name': 'VPB (VPBank)', 'value': 7250000000, 'pct': 6.4},
    {'name': 'MBV (MBV)', 'value': 3000000000, 'pct': 2.6},
    {'name': 'TPB (TPBank)', 'value': 2900000000, 'pct': 2.6},
    {'name': 'EVF (EVNFinance)', 'value': 1000001000, 'pct': 0.9},
]
rects2 = layout_treemap(items2, 0, 0, 100, 100)
print('\n--- Rects 2 (Card 2) ---')
for r in rects2:
    print(f"{r['name']}: x={r['x']:.1f}%, y={r['y']:.1f}%, w={r['w']:.1f}%, h={r['h']:.1f}%")
