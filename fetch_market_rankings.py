#!/usr/bin/env python3
"""Save a complete official closing session for the index-page rankings."""
import json
from webapp.api._market_rankings import SAVED, load_latest, saved_snapshot


def update_saved():
    try:
        payload = load_latest()
        previous = saved_snapshot()
        if previous and previous['asOf'] > payload['asOf']:
            raise ValueError('source session is older than saved session')
        SAVED.parent.mkdir(parents=True, exist_ok=True)
        temp = SAVED.with_suffix('.tmp')
        temp.write_text(json.dumps(payload, ensure_ascii=False, separators=(',', ':'), allow_nan=False) + '\n', encoding='utf-8')
        temp.replace(SAVED)
        print('market rankings {}: {} securities'.format(payload['asOf'], len(payload['rows'])), flush=True)
        return True
    except Exception as error:
        print('market rankings: retained saved session; {}'.format(error), flush=True)
        return False


if __name__ == '__main__':
    if not update_saved():
        raise SystemExit(1)
