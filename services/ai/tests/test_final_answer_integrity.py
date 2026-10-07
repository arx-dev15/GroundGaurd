import unittest
import os
import sys

# Ensure services/ai directory is in sys.path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from src.main import sanitize_user_facing_answer, EvidenceItem

class TestFinalAnswerIntegrity(unittest.TestCase):
    def test_example_1_dht11_preservation(self):
        raw = "The DHT11 has three pins: VCC, data, and GND. Connect VCC to 5 V, the data pin to the configured GPIO, and GND to ground. [DHT11 Notes for the Students.pdf, p. 1]"
        cleaned = sanitize_user_facing_answer(raw)
        self.assertIn("The DHT11 has three pins: VCC, data, and GND", cleaned)
        self.assertIn("[DHT11 Notes for the Students.pdf, p. 1]", cleaned)
        self.assertNotIn("doc_", cleaned)
        self.assertNotIn("chunk_", cleaned)

    def test_example_2_nextjs_technical_dots(self):
        raw = "The project uses Next.js for the frontend and FastAPI for the AI service. [Architecture.pdf, pp. 1–2]"
        cleaned = sanitize_user_facing_answer(raw)
        self.assertIn("The project uses Next.js for the frontend and FastAPI for the AI service.", cleaned)
        self.assertIn("[Architecture.pdf, pp. 1–2]", cleaned)

    def test_example_3_false_premise_correction(self):
        raw = "No. The source specifies port 7421, not 8080. [Zephyr_X9_Spec.pdf, p. 1]"
        cleaned = sanitize_user_facing_answer(raw)
        self.assertIn("No. The source specifies port 7421, not 8080.", cleaned)
        self.assertIn("[Zephyr_X9_Spec.pdf, p. 1]", cleaned)

    def test_example_4_debug_metadata_removal(self):
        raw = (
            "The system operates at 5 volts.\n"
            "Document: Example.pdf\n"
            "Document ID: doc_123\n"
            "Chunk ID: chk_456\n"
            "Supporting Excerpt: internal debug content"
        )
        cleaned = sanitize_user_facing_answer(raw)
        self.assertIn("The system operates at 5 volts.", cleaned)
        self.assertNotIn("Document ID:", cleaned)
        self.assertNotIn("Chunk ID:", cleaned)
        self.assertNotIn("Supporting Excerpt:", cleaned)

    def test_5_direct_factual_answers(self):
        cases = [
            ("The operating temperature ranges between -20 °C and 85 °C. [Spec.pdf, p. 3]", "operating temperature"),
            ("The device requires an input voltage of 3.3 V DC. [Power_Requirements.pdf, p. 1]", "input voltage"),
            ("Maximum supported payload weight is 450 kilograms. [Payload_Manual.pdf, p. 8]", "450 kilograms"),
            ("The default baud rate for serial UART communication is 115200. [Serial_Protocol.pdf, p. 2]", "115200"),
            ("The sensor sampling interval is configured to 250 milliseconds. [Timing.pdf, p. 5]", "250 milliseconds")
        ]
        for raw, expected_keyword in cases:
            cleaned = sanitize_user_facing_answer(raw)
            self.assertIn(expected_keyword, cleaned)
            self.assertGreater(len(cleaned), len(raw) * 0.8)

    def test_5_explanatory_answers(self):
        cases = [
            ("The cooling subsystem prevents thermal throttling by circulating chilled coolant across the heat exchanger whenever junction temperature exceeds 75 °C. [Thermal.pdf, p. 14]", "cooling subsystem"),
            ("Data synchronization uses an append-only write-ahead log to guarantee consistency across partition failures before committing to disk. [Storage.pdf, pp. 3–4]", "write-ahead log"),
            ("Authentication combines short-lived JWT access tokens with cryptographically signed refresh tokens stored in secure HTTP-only cookies. [Auth_Spec.pdf, p. 7]", "short-lived JWT"),
            ("The failover mechanism initiates heartbeat pings every 500 ms and promotes the standby node if 3 consecutive pings time out. [High_Availability.pdf, p. 11]", "heartbeat pings"),
            ("Packet compression applies Zstandard compression to message payloads exceeding 1 KB before transmission across the mesh network. [Network.pdf, p. 9]", "Zstandard compression")
        ]
        for raw, expected_keyword in cases:
            cleaned = sanitize_user_facing_answer(raw)
            self.assertIn(expected_keyword, cleaned)
            self.assertGreater(len(cleaned), len(raw) * 0.8)

    def test_3_false_premise_corrections(self):
        cases = [
            ("No, the reactor does not use liquid sodium; it uses pressurized light water cooling. [Reactor_Safety.pdf, p. 2]", "pressurized light water"),
            ("Incorrect. The maximum speed is rated for 120 km/h, not 200 km/h under standard loading conditions. [Velocity.pdf, p. 5]", "120 km/h"),
            ("The project documentation does not specify a 24-hour SLA; the documented response window is 4 business hours. [Service_Agreement.pdf, p. 1]", "4 business hours")
        ]
        for raw, expected_keyword in cases:
            cleaned = sanitize_user_facing_answer(raw)
            self.assertIn(expected_keyword, cleaned)
            self.assertGreater(len(cleaned), len(raw) * 0.8)

    def test_3_compound_answers(self):
        cases = [
            ("The subsystem monitors ambient pressure through barometric sensors and simultaneously logs relative humidity using digital hygrometers. [Atmosphere.pdf, p. 6]", "barometric sensors"),
            ("Primary power is delivered via the main 48 V bus, whereas secondary auxiliary sensors receive power from an isolated 5 V rail. [Power_Dist.pdf, pp. 2–3]", "isolated 5 V rail"),
            ("Dr. Watson moved his possessions on Tuesday morning, and Sherlock Holmes joined him that afternoon to arrange their quarters. [Study_in_Scarlet.pdf, p. 12]", "Sherlock Holmes")
        ]
        for raw, expected_keyword in cases:
            cleaned = sanitize_user_facing_answer(raw)
            self.assertIn(expected_keyword, cleaned)
            self.assertGreater(len(cleaned), len(raw) * 0.8)

    def test_3_abstentions(self):
        cases = [
            "I could not find sufficient information in the project documents to answer that question.",
            "The available project documentation does not contain details about the database encryption cipher.",
            "I could not find enough evidence in this project's sources to confirm the deployment schedule."
        ]
        for raw in cases:
            cleaned = sanitize_user_facing_answer(raw)
            self.assertEqual(cleaned, raw)

    def test_3_multi_citation_answers(self):
        cases = [
            ("The feedwater pumps maintain head pressure [Feedwater_Alpha.pdf, p. 1] and switch to recirculating mode when discharge valves close [Feedwater_Beta.pdf, p. 4].", ["Feedwater_Alpha.pdf", "Feedwater_Beta.pdf"]),
            ("Initial calibration occurs at factory testing [QC_Manual.pdf, p. 1], but field re-zeroing is mandatory every 90 operational days [Maintenance_Schedule.pdf, p. 12].", ["QC_Manual.pdf", "Maintenance_Schedule.pdf"]),
            ("Encryption keys are generated in an HSM [Security_Whitepaper.pdf, p. 2] and rotated on a quarterly schedule [Compliance_Policy.pdf, p. 8].", ["Security_Whitepaper.pdf", "Compliance_Policy.pdf"])
        ]
        for raw, expected_sources in cases:
            cleaned = sanitize_user_facing_answer(raw)
            for src in expected_sources:
                self.assertIn(src, cleaned)

    def test_3_streaming_accumulations(self):
        chunks_lists = [
            ["The DHT-11 sensor features ", "three pin connections: ", "the leftmost pin is VIN, ", "which connects to 5 V. [DHT11 Notes for the Students.pdf, p. 1]"],
            ["The system uses Next.js ", "for the frontend ", "and FastAPI for the AI service. ", "[Architecture.pdf, pp. 1–2]"],
            ["No. ", "The source specifies port 7421, ", "not 8080. ", "[Zephyr_X9_Spec.pdf, p. 1]"]
        ]
        for chunks in chunks_lists:
            accumulated = "".join(chunks)
            cleaned = sanitize_user_facing_answer(accumulated)
            self.assertGreater(len(cleaned), len(accumulated) * 0.8)
            self.assertIn(".pdf", cleaned)

    def test_special_guard_assertion(self):
        # A valid substantive answer must NEVER lose >80% of its content
        long_answer = "The DHT-11 sensor features three pin connections: the leftmost pin is VIN, which connects to 5 V; the middle pin connects to digital pin 5; and the rightmost pin, marked with a minus ('-') sign, is the GND pin [DHT11 Notes for the Students.pdf, p. 1, p. 2]."
        cleaned = sanitize_user_facing_answer(long_answer)
        self.assertGreaterEqual(
            len(cleaned),
            len(long_answer) * 0.8,
            f"Substantive answer lost >80% content: input={len(long_answer)} clean={len(cleaned)}"
        )

if __name__ == '__main__':
    unittest.main()
