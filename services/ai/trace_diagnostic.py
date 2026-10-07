import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from src.pipeline.db import get_connection

def main():
    conn = get_connection()
    if conn is None:
        print("Failed to connect")
        return
    with conn.cursor() as cur:
        cur.execute("SELECT id, name FROM projects ORDER BY created_at DESC;")
        projs = cur.fetchall()
        for pid, name in projs:
            print(f"Project: {name} ({pid})")
            cur.execute("SELECT id, filename, status FROM documents WHERE project_id = %s;", (pid,))
            docs = cur.fetchall()
            for doc in docs:
                print(f"  Doc: {doc[1]} ({doc[0]}) - {doc[2]}")
    conn.close()

if __name__ == '__main__':
    main()
