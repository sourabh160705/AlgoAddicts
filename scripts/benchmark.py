import sys,argparse,time,psutil
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from backend.database.queries import database_stats
from backend.graph.trace import trace_money_flow
p=argparse.ArgumentParser(); p.add_argument('--account',required=True); a=p.parse_args()
print('Dataset:',database_stats()); proc=psutil.Process(); before=proc.memory_info().rss; start=time.perf_counter(); r=trace_money_flow(a.account,4); elapsed=time.perf_counter()-start; after=proc.memory_info().rss
print(f'4-hop trace seconds: {elapsed:.4f}'); print(f'RSS delta MB: {(after-before)/1024/1024:.2f}'); print(f"Nodes: {r['node_count']} Edges: {r['edge_count']}"); print('Target check (not a claim):', 'PASS' if elapsed<=2 else 'NOT YET')
