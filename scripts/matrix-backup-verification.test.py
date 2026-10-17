"""Verify the restore preflight rejects broken units without contacting Docker."""
import hashlib
import io
import json
from pathlib import Path
import sqlite3
import subprocess
import tarfile
import tempfile
import unittest

RESTORE = Path(__file__).resolve().parents[1] / 'deploy/matrix/restore.sh'


def tar_bytes(files):
    output = io.BytesIO()
    with tarfile.open(fileobj=output, mode='w') as archive:
        for name, content in files.items():
            entry = tarfile.TarInfo(name)
            entry.size = len(content)
            archive.addfile(entry, io.BytesIO(content))
    return output.getvalue()


class RestoreVerification(unittest.TestCase):
    def check_archive(self, *, mutation=None, corrupt=False, succeeds=False):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            db = sqlite3.connect(root / 'bridge.sqlite')
            db.execute('CREATE TABLE sync_source (id INTEGER, source_id TEXT)')
            db.execute("INSERT INTO sync_source VALUES (1, 'fixture-source')")
            db.commit()
            db.close()
            files = {
                'postgres.dump': b'fixture dump', 'mas.dump': b'fixture dump',
                'config.tar': tar_bytes({
                    'synapse/fixture.signing.key': b'fixture',
                    'mas/config.yaml': b'fixture', 'mas/para-idp.env': b'fixture',
                    'hardening.yaml': b'fixture', 'element-config.json': b'{}',
                }),
                'operator.tar': tar_bytes({'.env': b'fixture', 'docker-compose.matrix.yaml': b'fixture'}),
                'media.tar': tar_bytes({'media_store/fixture': b'fixture'}),
                'bridge.sqlite': (root / 'bridge.sqlite').read_bytes(),
                'manifest.json': json.dumps({'format': 2, 'bridgeSource': 'fixture-source'}).encode(),
            }
            if mutation:
                mutation(files)
            files['SHA256SUMS'] = ''.join(
                f'{hashlib.sha256(value).hexdigest()}  {name}\n'
                for name, value in files.items()
            ).encode()
            if corrupt:
                files['mas.dump'] += b'corrupted'
            target = root / 'unit.tar'
            target.write_bytes(tar_bytes(files))
            result = subprocess.run(['bash', str(RESTORE), str(target), '--verify'], capture_output=True, text=True)
            self.assertEqual(result.returncode == 0, succeeds, result.stderr)

    def test_valid_structural_unit(self):
        self.check_archive(succeeds=True)

    def test_corrupted_component(self):
        self.check_archive(corrupt=True)

    def test_source_mismatch(self):
        self.check_archive(mutation=lambda files: files.update({'manifest.json': b'{"format":2,"bridgeSource":"another-source"}'}))

    def test_nested_traversal(self):
        self.check_archive(mutation=lambda files: files.update({'media.tar': tar_bytes({'../outside': b'unsafe'})}))

    def test_unexpected_nested_file(self):
        self.check_archive(mutation=lambda files: files.update({'media.tar': tar_bytes({'unexpected': b'unsafe'})}))

    def test_missing_identity_configuration(self):
        self.check_archive(mutation=lambda files: files.update({'config.tar': tar_bytes({'hardening.yaml': b'fixture'})}))


if __name__ == '__main__':
    unittest.main()
