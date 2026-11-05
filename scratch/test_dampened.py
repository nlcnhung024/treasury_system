import sys
import os
sys.path.append(os.path.dirname(__file__))
from test_refined_treemap import compute_treemap, items2

# Test with visual dampening (minimum layout weight of 3.5%)
total_val = sum(x['value'] for x in items2)
dampened_items = []
for it in items2:
    min_val = total_val * 0.035 # at least 3.5% for layout geometry
    dampened_items.append({
        **it,
        'value': max(it['value'], min_val)
    })

print('=== CARD 2 WITH MINIMUM 3.5% LAYOUT WEIGHT ===')
for r in compute_treemap(dampened_items, 100, 100):
    true_pct = (next(x for x in items2 if x['name'] == r['name'])['value'] / total_val) * 100
    print(f"{r['name']}: x={r['x']:.1f}%, y={r['y']:.1f}%, w={r['w']:.1f}%, h={r['h']:.1f}%, true_pct={true_pct:.1f}%")
