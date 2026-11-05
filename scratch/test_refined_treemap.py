import sys
sys.stdout.reconfigure(encoding='utf-8')

# Let's test a refined Treemap algorithm that guarantees minimum readable width/height
def compute_treemap(items, width=100.0, height=100.0):
    # items sorted desc
    total = sum(x['value'] for x in items)
    if total <= 0:
        return []
    
    # Let's use recursive binary space partitioning with aspect-ratio optimization
    def partition(node_items, x, y, w, h):
        if not node_items:
            return []
        if len(node_items) == 1:
            it = node_items[0]
            pct = (it['value'] / total) * 100.0
            return [{
                **it,
                'x': x,
                'y': y,
                'w': w,
                'h': h,
                'pct': pct
            }]
            
        sub_total = sum(x['value'] for x in node_items)
        half = sub_total / 2.0
        
        # Find split index
        running = 0.0
        split = 1
        best_diff = sub_total
        for i, it in enumerate(node_items):
            running += it['value']
            diff = abs(running - half)
            if diff < best_diff:
                best_diff = diff
                split = i + 1
            elif running > half and i > 0:
                break
                
        g1 = node_items[:split]
        g2 = node_items[split:]
        if not g2:
            g1 = node_items[:-1]
            g2 = node_items[-1:]
            
        s1 = sum(x['value'] for x in g1)
        s2 = sum(x['value'] for x in g2)
        
        # Decide orientation based on current rectangle aspect ratio
        if w >= h:
            w1 = (s1 / sub_total) * w
            w2 = w - w1
            return partition(g1, x, y, w1, h) + partition(g2, x + w1, y, w2, h)
        else:
            h1 = (s1 / sub_total) * h
            h2 = h - h1
            return partition(g1, x, y, w, h1) + partition(g2, x, y + h1, w, h2)

    return partition(items, 0.0, 0.0, width, height)

items1 = [
    {'name': 'Doanh nghiệp vay vốn MB', 'value': 48805525000},
    {'name': 'CTCP XI MANG SUNRISE', 'value': 44505016000},
    {'name': 'CTCP TM VA PT HUONG GIANG', 'value': 20192321197},
]

items2 = [
    {'name': 'MBB (MB)', 'value': 68997846197},
    {'name': 'CTG (VietinBank)', 'value': 30355015000},
    {'name': 'VPB (VPBank)', 'value': 7250000000},
    {'name': 'MBV (MBV)', 'value': 3000000000},
    {'name': 'TPB (TPBank)', 'value': 2900000000},
    {'name': 'EVF (EVNFinance)', 'value': 1000001000},
]

print('=== CARD 1 ===')
for r in compute_treemap(items1, 100, 100):
    print(f"{r['name']}: x={r['x']:.1f}%, y={r['y']:.1f}%, w={r['w']:.1f}%, h={r['h']:.1f}%, pct={r['pct']:.1f}%")

print('\n=== CARD 2 ===')
for r in compute_treemap(items2, 100, 100):
    print(f"{r['name']}: x={r['x']:.1f}%, y={r['y']:.1f}%, w={r['w']:.1f}%, h={r['h']:.1f}%, pct={r['pct']:.1f}%")

