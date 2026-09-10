import codecs
import tempfile
import unittest
from pathlib import Path

from scripts.prepare_requirements import prepare_requirements


class PrepareRequirementsTest(unittest.TestCase):
    CONTENT = "package-one==1.2.3\npackage-two==4.5.6\n"

    def convert(self, payload):
        with tempfile.TemporaryDirectory() as directory:
            source = Path(directory, "requirements.txt")
            destination = Path(directory, "runner", "requirements.txt")
            source.write_bytes(payload)
            original = source.read_bytes()
            prepare_requirements(source, destination)
            self.assertEqual(source.read_bytes(), original)
            return destination.read_bytes()

    def test_utf8(self):
        self.assertEqual(self.convert(self.CONTENT.encode("utf-8")), self.CONTENT.encode())

    def test_utf8_bom(self):
        payload = codecs.BOM_UTF8 + self.CONTENT.encode("utf-8")
        self.assertEqual(self.convert(payload), self.CONTENT.encode())

    def test_utf16_little_endian_bom(self):
        payload = codecs.BOM_UTF16_LE + self.CONTENT.encode("utf-16-le")
        self.assertEqual(self.convert(payload), self.CONTENT.encode())

    def test_utf16_big_endian_bom(self):
        payload = codecs.BOM_UTF16_BE + self.CONTENT.encode("utf-16-be")
        self.assertEqual(self.convert(payload), self.CONTENT.encode())

    def test_invalid_input_fails_without_creating_output(self):
        with tempfile.TemporaryDirectory() as directory:
            source = Path(directory, "requirements.txt")
            destination = Path(directory, "output.txt")
            source.write_bytes(b"\x80\x81")
            with self.assertRaisesRegex(ValueError, "not valid UTF-8"):
                prepare_requirements(source, destination)
            self.assertFalse(destination.exists())

    def test_source_and_destination_must_differ(self):
        with tempfile.TemporaryDirectory() as directory:
            source = Path(directory, "requirements.txt")
            source.write_text(self.CONTENT, encoding="utf-8")
            with self.assertRaisesRegex(ValueError, "must be different"):
                prepare_requirements(source, source)

    def test_repository_requirements_round_trip_preserves_dependencies(self):
        source = Path(__file__).with_name("requirements.txt")
        with tempfile.TemporaryDirectory() as directory:
            destination = Path(directory, "requirements.txt")
            prepare_requirements(source, destination)
            expected = source.read_bytes()[len(codecs.BOM_UTF16_LE) :].decode("utf-16-le")
            self.assertEqual(destination.read_bytes().decode("utf-8"), expected)


if __name__ == "__main__":
    unittest.main()
