#!/usr/bin/env python3
"""Durable, unprivileged transaction runner. Only the package manager is elevated."""
import datetime
import json
import os
from pathlib import Path
import subprocess
import sys


def write_json(path, data):
    temporary = path.with_suffix('.tmp')
    temporary.write_text(json.dumps(data, ensure_ascii=False))
    temporary.replace(path)


def alive(pid):
    try:
        os.kill(int(pid), 0)
        return True
    except (ProcessLookupError, ValueError, TypeError):
        return False
    except PermissionError:
        return True


def main(directory):
    directory = Path(directory).resolve()
    state_path = directory / 'state.json'
    state = json.loads(state_path.read_text())
    plan = json.loads((directory / 'plan.json').read_text())
    lock = directory.parent / 'transaction.lock'
    owns_lock = False
    try:
        for attempt in range(2):
            try:
                lock.mkdir(mode=0o700)
                owns_lock = True
                (lock / 'pid').write_text(str(os.getpid()))
                break
            except FileExistsError:
                try:
                    owner = (lock / 'pid').read_text()
                except FileNotFoundError:
                    # The other runner may be between mkdir and writing its PID.
                    raise RuntimeError('Another transaction is starting. Check Transaction History.')
                if alive(owner):
                    raise RuntimeError('Another package transaction is running. Wait for it to finish.')
                try:
                    (lock / 'pid').unlink()
                    lock.rmdir()
                except FileNotFoundError:
                    pass
        if not owns_lock:
            raise RuntimeError('Could not acquire the transaction lock.')
        state.update(status='running', pid=os.getpid())
        write_json(state_path, state)
        env = dict(os.environ, LC_ALL='C', NO_COLOR='1', PYTHONUNBUFFERED='1')
        with (directory / 'output.log').open('ab', buffering=0) as log:
            for command in plan['commands']:
                args = [command['file'], *command['args']]
                header = ('\n$ ' + ' '.join(args) + '\n').encode()
                log.write(header)
                if command.get('terminal'):
                    sys.stdout.buffer.write(header)
                    sys.stdout.buffer.flush()
                with subprocess.Popen(args, stdin=None if command.get('terminal') else subprocess.DEVNULL,
                                      stdout=subprocess.PIPE, stderr=subprocess.STDOUT, env=env) as child:
                    while True:
                        chunk = os.read(child.stdout.fileno(), 4096)
                        if not chunk:
                            break
                        log.write(chunk)
                        if command.get('terminal'):
                            sys.stdout.buffer.write(chunk)
                            sys.stdout.buffer.flush()
                    code = child.wait()
                state['exitCode'] = code
                if code not in [0, *command.get('acceptedCodes', [])]:
                    raise RuntimeError(f'Transaction exited with code {code}. See the log for details.')
        state['status'] = 'success'
    except Exception as error:
        state.update(status='failed', error=str(error))
        with (directory / 'output.log').open('a') as log:
            log.write('\n' + str(error) + '\n')
    finally:
        state['finishedAt'] = datetime.datetime.now(datetime.timezone.utc).isoformat()
        write_json(state_path, state)
        if owns_lock:
            try:
                (lock / 'pid').unlink()
                lock.rmdir()
            except FileNotFoundError:
                pass
    if any(c.get('terminal') for c in plan['commands']):
        print('\n' + ('Completed.' if state['status'] == 'success' else state.get('error', 'Transaction failed.')))
        try:
            input('Press Enter to close…')
        except EOFError:
            pass
    return 0 if state['status'] == 'success' else 1


if __name__ == '__main__':
    sys.exit(main(sys.argv[1]))
