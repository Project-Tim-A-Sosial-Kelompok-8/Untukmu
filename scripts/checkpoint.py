"""Source-only recovery archive; the release packager includes original assets separately."""
import sys
from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED
root=Path(__file__).resolve().parents[1]
excluded={'node_modules','.next','.git','__pycache__','.pytest_cache','.ruff_cache','test-results','playwright-report','legacy','referensi','engine'}
with ZipFile(sys.argv[1],'w',ZIP_DEFLATED) as z:
    for p in root.rglob('*'):
        rel=p.relative_to(root)
        if p.is_file() and not set(rel.parts)&excluded and p.name!='.env' and p.suffix not in ('.db','.pyc','.tsbuildinfo'):
            z.write(p,str(rel))
