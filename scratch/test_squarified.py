import sys
sys.stdout.reconfigure(encoding='utf-8')

def squarify(children, row, w):
    if not children:
        return [row]
    c = children[0]
    if not row:
        return squarify(children[1:], [c], w)
    
    # Check worst aspect ratio of row with and without c
    def worst(r, width):
        s = sum(x['norm_val'] for x in r)
        if s <= 0 or width <= 0:
            return float('inf')
        max_v = max(x['norm_val'] for x in r)
        min_v = min(x['norm_val'] for x in r)
        w_sq = width * width
        s_sq = s * s
        return max((w_sq * max_v) / s_sq, s_sq / (w_sq * min_v))

    if worst(row, w) >= worst(row + [c], w):
        return squarify(children[1:], row + [c], w)
    else:
        return [row] + squarify(children, [], w)

def layout_squarified(items, width=100.0, height=100.0):
    total = sum(x['value'] for x in items)
    if total <= 0:
        return []
    
    # Normalized values so sum of values = width * height
    norm_items = []
    for it in items:
        norm_val = (it['value'] / total) * (width * height)
        norm_items.append({**it, 'norm_val': norm_val})
        
    norm_items.sort(key=lambda x: x['norm_val'], reverse=True)
    
    # Layout loop
    x, y, w, h = 0.0, 0.0, width, height
    remaining = norm_items[:]
    rects = []
    
    while remaining:
        shorter_side = min(w, h)
        # Find next row
        row = []
        while remaining:
            c = remaining[0]
            test_row = row + [c]
            def worst(r, side):
                s = sum(item['norm_val'] for item in r)
                if s <= 0 or side <= 0: return float('inf')
                max_v = max(item['norm_val'] for item in r)
                min_v = min(item['norm_val'] for item in r)
                s_sq = s * s
                side_sq = side * side
                return max((side_sq * max_v) / s_sq, s_sq / (side_sq * min_v))
            
            if not row or worst(row, shorter_side) >= worst(test_row, shorter_side):
                row.append(c)
                remaining.pop(0)
            else:
                break
                
        # Layout the row
        row_sum = sum(item['norm_val'] for item in row)
        if w <= h:
            row_h = row_sum / w if w > 0 else 0
            cur_x = x
            for item in row:
                item_w = item['norm_val'] / row_h if row_h > 0 else 0
                rects.append({**item, 'x': cur_x, 'y': y, 'w': item_w, 'h': row_h})
                cur_x += item_w
            y += row_h
            h -= row_h
        else:
            row_w = row_sum / h if h > 0 else 0
            cur_y = y
            for item in row:
                item_h = item['norm_val'] / row_w if row_w > 0 else 0
                rects.append({**item, 'x': x, 'y': cur_y, 'w': row_w, 'h': item_h})
                cur_y += item_h
            x += row_w
            w -= row_w
            
    return rects

items1 = [
    {'name': 'Doanh nghiệp vay vốn MB', 'value': 48805525000, 'pct': 43.0},
    {'name': 'CTCP XI MANG SUNRISE', 'value': 44505016000, 'pct': 39.2},
    {'name': 'CTCP TM VA PT HUONG GIANG', 'value': 20192321197, 'pct': 17.8},
]
rects1 = layout_squarified(items1, 100, 100)
print('--- Squarified 1 (Card 1) ---')
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
rects2 = layout_squarified(items2, 100, 100)
print('\n--- Squarified 2 (Card 2) ---')
for r in rects2:
    print(f"{r['name']}: x={r['x']:.1f}%, y={r['y']:.1f}%, w={r['w']:.1f}%, h={r['h']:.1f}%")

