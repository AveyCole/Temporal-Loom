"""Build Loom's compact search index from Princeton WordNet 3.0."""

import argparse
import json
import re
import tarfile
from collections import defaultdict
from pathlib import Path


PARTS = {"n": "noun", "v": "verb", "a": "adj", "r": "adv"}
RELATIONS = ("&", "^", "~", "@")


def clean(word):
    return word.lower().replace("_", " ")


def usable(word):
    return (3 <= len(word) <= 56 and word.count(" ") <= 4
            and re.fullmatch(r"[a-z][a-z0-9 -]*", word) is not None)


def read_lexicon(dictionary):
    sets = {}
    senses = defaultdict(list)
    for part, suffix in PARTS.items():
        for row in dictionary[f"data.{suffix}"]:
            fields = row.split("|", 1)[0].split()
            if not row[:1].isdigit() or len(fields) < 5:
                continue
            end = 4 + 2 * int(fields[3], 16)
            words = [clean(word) for word in fields[4:end:2]]
            pointers = fields[end + 1:end + 1 + 4 * int(fields[end])]
            relations = [(kind, ("a" if pos == "s" else pos, offset))
                         for kind, offset, pos, _ in zip(*(iter(pointers),) * 4) if kind in RELATIONS]
            sets[(part, fields[0])] = (words, relations)
        for row in dictionary[f"index.{suffix}"]:
            if row.startswith(" "):
                continue
            fields = row.split()
            word = clean(fields[0])
            if usable(word):
                count = int(fields[2])
                senses[word].extend((part, offset) for offset in fields[-count:][:2])
    return sets, senses


def build_index(dictionary):
    sets, senses = read_lexicon(dictionary)
    index = {}
    for word, keys in sorted(senses.items()):
        words = {word}
        related = []
        for key in keys:
            synonyms, relations = sets[key]
            candidates = list(synonyms)
            for kind in RELATIONS:
                for relation, target in relations:
                    if kind == relation and target in sets:
                        candidates.extend(sets[target][0][:2])
            for candidate in candidates:
                if candidate not in words and usable(candidate):
                    words.add(candidate)
                    related.append(candidate)
                if len(related) == 6:
                    break
            if len(related) == 6:
                break
        if related:
            index[word] = related
    return index


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("archive", type=Path, help="Official WordNet-3.0.tar.gz")
    parser.add_argument("--assets", type=Path, default=Path("assets"))
    args = parser.parse_args()
    dictionary = {}
    with tarfile.open(args.archive, "r:gz") as archive:
        for member in archive.getmembers():
            name = Path(member.name).name
            if member.isfile() and member.name.rsplit("/", 2)[-2:-1] == ["dict"]:
                if name.startswith(("data.", "index.")) and name.rsplit(".", 1)[-1] in PARTS.values():
                    dictionary[name] = archive.extractfile(member).read().decode("ascii").splitlines()
        license_text = archive.extractfile("WordNet-3.0/LICENSE").read()
    index = build_index(dictionary)
    (args.assets / "thesaurus.json").write_text(
        json.dumps(index, ensure_ascii=True, separators=(",", ":")) + "\n", encoding="utf-8")
    (args.assets / "legal").mkdir(exist_ok=True)
    (args.assets / "legal/WordNet-LICENSE.txt").write_bytes(license_text)
    print(f"Indexed {len(index):,} terms")


if __name__ == "__main__":
    main()
