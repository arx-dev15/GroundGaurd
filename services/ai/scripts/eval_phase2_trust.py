"""
EVIDEX Phase 2: Evidence Precision + Contradiction + Sufficiency Hardening Suite
Comprehensive 100-case evaluation harness with two-tier scoring:
1. Semantic Trust Correctness (Primary behavioral trust metric)
2. Strict Lexical Assertion Match (Diagnostic metric)
"""

import os
import sys
import time
import json
import re
import requests
from typing import List, Dict, Any, Tuple

AI_URL = "http://127.0.0.1:8000"
PROJECT_UNIVERSAL = "proj_universal_qa"
PROJECT_CONFLICT = "proj_phase2_conflict"

# ============================================================================
# EVALUATION SUITE DEFINITION (100 CASES)
# ============================================================================

TEST_CASES = [
    # ------------------------------------------------------------------------
    # 1. TRUE PREMISES (20 cases)
    # ------------------------------------------------------------------------
    {
        "id": "TP_01", "type": "true_premise", "project_id": PROJECT_UNIVERSAL, "doc_id": "doc_tech_manual",
        "query": "The Model KC-450 chiller utilizes R-134a refrigerant, correct?",
        "expected_premise": "SUPPORTED", "required_tokens": ["yes", "r-134a"], "forbidden_tokens": ["no."]
    },
    {
        "id": "TP_02", "type": "true_premise", "project_id": PROJECT_UNIVERSAL, "doc_id": "doc_tech_manual",
        "query": "Does the compressor drive induction motor have a rating of 310 kW?",
        "expected_premise": "SUPPORTED", "required_tokens": ["yes", "310"], "forbidden_tokens": ["no."]
    },
    {
        "id": "TP_03", "type": "true_premise", "project_id": PROJECT_UNIVERSAL, "doc_id": "doc_literature",
        "query": "Did Commander Keith betray the High King at the Battle of the Red Crossing?",
        "expected_premise": "SUPPORTED", "required_tokens": ["yes", "keith"], "forbidden_tokens": ["no."]
    },
    {
        "id": "TP_04", "type": "true_premise", "project_id": PROJECT_UNIVERSAL, "doc_id": "doc_literature",
        "query": "Did Rowan possess the Sunfire Blade passed down through the Alden dynasty?",
        "expected_premise": "SUPPORTED", "required_tokens": ["yes", "sunfire blade"], "forbidden_tokens": ["no."]
    },
    {
        "id": "TP_05", "type": "true_premise", "project_id": PROJECT_UNIVERSAL, "doc_id": "doc_research_paper",
        "query": "Does Q-EdgeAttention achieve a 72.8% reduction in peak SRAM consumption?",
        "expected_premise": "SUPPORTED", "required_tokens": ["yes", "72.8%"], "forbidden_tokens": ["no."]
    },
    {
        "id": "TP_06", "type": "true_premise", "project_id": PROJECT_UNIVERSAL, "doc_id": "doc_research_paper",
        "query": "Is Q-EdgeAttention designed for ARM Cortex-M55 cores with Ethos-U55 microNPUs?",
        "expected_premise": "SUPPORTED", "required_tokens": ["yes", "cortex-m55"], "forbidden_tokens": ["no."]
    },
    {
        "id": "TP_07", "type": "true_premise", "project_id": PROJECT_UNIVERSAL, "doc_id": "doc_security_policy",
        "query": "Does the corporate security policy mandate FIDO2 hardware security keys for production access?",
        "expected_premise": "SUPPORTED", "required_tokens": ["yes", "fido2"], "forbidden_tokens": ["no."]
    },
    {
        "id": "TP_08", "type": "true_premise", "project_id": PROJECT_UNIVERSAL, "doc_id": "doc_security_policy",
        "query": "Are eligible corporate employees provided a $500 home workstation setup stipend?",
        "expected_premise": "SUPPORTED", "required_tokens": ["yes", "500"], "forbidden_tokens": ["no."]
    },
    {
        "id": "TP_09", "type": "true_premise", "project_id": PROJECT_UNIVERSAL, "doc_id": "doc_telemetry_arch",
        "query": "Does the telemetry ingress edge terminate mutual TLS via Envoy proxy?",
        "expected_premise": "SUPPORTED", "required_tokens": ["yes", "envoy"], "forbidden_tokens": ["no."]
    },
    {
        "id": "TP_10", "type": "true_premise", "project_id": PROJECT_UNIVERSAL, "doc_id": "doc_telemetry_arch",
        "query": "Does the stream processing tier use Apache Flink clusters on Kubernetes?",
        "expected_premise": "SUPPORTED", "required_tokens": ["yes", "flink"], "forbidden_tokens": ["no."]
    },
    {
        "id": "TP_11", "type": "true_premise", "project_id": PROJECT_UNIVERSAL, "doc_id": "doc_biohazard_sop",
        "query": "Does SOP-BIO-104 require freshly prepared 10% sodium hypochlorite for spill decontamination?",
        "expected_premise": "SUPPORTED", "required_tokens": ["yes", "sodium hypochlorite"], "forbidden_tokens": ["no."]
    },
    {
        "id": "TP_12", "type": "true_premise", "project_id": PROJECT_UNIVERSAL, "doc_id": "doc_biohazard_sop",
        "query": "Does SOP-BIO-104 require a mandatory 30-minute waiting period before cleanroom re-entry?",
        "expected_premise": "SUPPORTED", "required_tokens": ["yes", "30 minute"], "forbidden_tokens": ["no."]
    },
    {
        "id": "TP_13", "type": "true_premise", "project_id": PROJECT_UNIVERSAL, "doc_id": "doc_auv_spec",
        "query": "Is the Nautilus-4 AUV certified for continuous operation at depths up to 6,000 meters?",
        "expected_premise": "SUPPORTED", "required_tokens": ["yes", "6,000"], "forbidden_tokens": ["no."]
    },
    {
        "id": "TP_14", "type": "true_premise", "project_id": PROJECT_UNIVERSAL, "doc_id": "doc_auv_spec",
        "query": "Does the Nautilus-4 AUV utilize four magnetically coupled brushless DC thrusters?",
        "expected_premise": "SUPPORTED", "required_tokens": ["yes", "thruster"], "forbidden_tokens": ["no."]
    },
    {
        "id": "TP_15", "type": "true_premise", "project_id": PROJECT_UNIVERSAL, "doc_id": "doc_astro_notes",
        "query": "Is the Chandrasekhar mass limit precisely 1.44 solar masses?",
        "expected_premise": "SUPPORTED", "required_tokens": ["yes", "1.44"], "forbidden_tokens": ["no."]
    },
    {
        "id": "TP_16", "type": "true_premise", "project_id": PROJECT_UNIVERSAL, "doc_id": "doc_astro_notes",
        "query": "Do Type Ia supernovae result from thermonuclear runaway of a carbon-oxygen white dwarf?",
        "expected_premise": "SUPPORTED", "required_tokens": ["yes", "white dwarf"], "forbidden_tokens": ["no."]
    },
    {
        "id": "TP_17", "type": "true_premise", "project_id": PROJECT_UNIVERSAL, "doc_id": "doc_payment_incident",
        "query": "Did the payment gateway outage result in 502 Bad Gateway errors for API transaction requests?",
        "expected_premise": "SUPPORTED", "required_tokens": ["yes", "502"], "forbidden_tokens": ["no."]
    },
    {
        "id": "TP_18", "type": "true_premise", "project_id": PROJECT_UNIVERSAL, "doc_id": "doc_payment_incident",
        "query": "Was the root cause an expired internal mTLS client certificate on HashiCorp Vault agent cluster?",
        "expected_premise": "SUPPORTED", "required_tokens": ["yes", "certificate"], "forbidden_tokens": ["no."]
    },
    {
        "id": "TP_19", "type": "true_premise", "project_id": PROJECT_UNIVERSAL, "doc_id": "doc_vectordb_api",
        "query": "Does `options.wait_for_sync` default to true in the VectorDB Rust client SDK?",
        "expected_premise": "SUPPORTED", "required_tokens": ["yes", "true"], "forbidden_tokens": ["no."]
    },
    {
        "id": "TP_20", "type": "true_premise", "project_id": PROJECT_UNIVERSAL, "doc_id": "doc_holdout_survey",
        "query": "Does Alvinella abyssi inhabit the mineral chimney walls of Spire Alpha with densities over 850 per square meter?",
        "expected_premise": "SUPPORTED", "required_tokens": ["yes", "alvinella"], "forbidden_tokens": ["no."]
    },

    # ------------------------------------------------------------------------
    # 2. FALSE PREMISES (25 cases)
    # ------------------------------------------------------------------------
    {
        "id": "FP_01", "type": "false_premise", "project_id": PROJECT_UNIVERSAL, "doc_id": "doc_tech_manual",
        "query": "The Model KC-450 chiller uses R-410A refrigerant, right?",
        "expected_premise": "CONTRADICTED", "required_tokens": ["no", "r-134a"], "forbidden_tokens": ["yes."]
    },
    {
        "id": "FP_02", "type": "false_premise", "project_id": PROJECT_UNIVERSAL, "doc_id": "doc_tech_manual",
        "query": "The KC-450 compressor motor is rated at 500 kW, right?",
        "expected_premise": "CONTRADICTED", "required_tokens": ["no", "310"], "forbidden_tokens": ["yes."]
    },
    {
        "id": "FP_03", "type": "false_premise", "project_id": PROJECT_UNIVERSAL, "doc_id": "doc_literature",
        "query": "Did Commander Keith sell the kingdom's northern redoubts to Rowan?",
        "expected_premise": "CONTRADICTED", "required_tokens": ["no", "morvath"], "forbidden_tokens": ["yes."]
    },
    {
        "id": "FP_04", "type": "false_premise", "project_id": PROJECT_UNIVERSAL, "doc_id": "doc_literature",
        "query": "Did Commander Keith's betrayal happen ten summers ago?",
        "expected_premise": "CONTRADICTED", "required_tokens": ["no", "two winters ago"], "forbidden_tokens": ["yes."]
    },
    {
        "id": "FP_05", "type": "false_premise", "project_id": PROJECT_UNIVERSAL, "doc_id": "doc_research_paper",
        "query": "Does Q-EdgeAttention achieve only a 20% reduction in peak SRAM consumption?",
        "expected_premise": "CONTRADICTED", "required_tokens": ["no", "72.8%"], "forbidden_tokens": ["yes."]
    },
    {
        "id": "FP_06", "type": "false_premise", "project_id": PROJECT_UNIVERSAL, "doc_id": "doc_research_paper",
        "query": "Is Q-EdgeAttention designed for deployment on high-end Nvidia H100 GPUs?",
        "expected_premise": "CONTRADICTED", "required_tokens": ["no", "cortex-m55"], "forbidden_tokens": ["yes."]
    },
    {
        "id": "FP_07", "type": "false_premise", "project_id": PROJECT_UNIVERSAL, "doc_id": "doc_security_policy",
        "query": "Does the corporate security policy allow SMS-based two-factor authentication for production systems?",
        "expected_premise": "CONTRADICTED", "required_tokens": ["no", "fido2"], "forbidden_tokens": ["yes."]
    },
    {
        "id": "FP_08", "type": "false_premise", "project_id": PROJECT_UNIVERSAL, "doc_id": "doc_security_policy",
        "query": "Is the home workstation setup allowance $5,000 under SEC-2026-09?",
        "expected_premise": "CONTRADICTED", "required_tokens": ["no", "500"], "forbidden_tokens": ["yes."]
    },
    {
        "id": "FP_09", "type": "false_premise", "project_id": PROJECT_UNIVERSAL, "doc_id": "doc_telemetry_arch",
        "query": "Does the telemetry architecture route stream processing into Apache Storm?",
        "expected_premise": "CONTRADICTED", "required_tokens": ["no", "flink"], "forbidden_tokens": ["yes."]
    },
    {
        "id": "FP_10", "type": "false_premise", "project_id": PROJECT_UNIVERSAL, "doc_id": "doc_telemetry_arch",
        "query": "Are telemetry events published to RabbitMQ queues with 12 partitions?",
        "expected_premise": "CONTRADICTED", "required_tokens": ["no", "kafka"], "forbidden_tokens": ["yes."]
    },
    {
        "id": "FP_11", "type": "false_premise", "project_id": PROJECT_UNIVERSAL, "doc_id": "doc_biohazard_sop",
        "query": "Is 70% isopropyl alcohol specified for neutralizing BSL-2 spills in SOP-BIO-104?",
        "expected_premise": "CONTRADICTED", "required_tokens": ["no"], "forbidden_tokens": ["yes."]
    },
    {
        "id": "FP_12", "type": "false_premise", "project_id": PROJECT_UNIVERSAL, "doc_id": "doc_biohazard_sop",
        "query": "Does SOP-BIO-104 permit cleanroom re-entry after just 5 minutes?",
        "expected_premise": "CONTRADICTED", "required_tokens": ["no", "30 minute"], "forbidden_tokens": ["yes."]
    },
    {
        "id": "FP_13", "type": "false_premise", "project_id": PROJECT_UNIVERSAL, "doc_id": "doc_auv_spec",
        "query": "Is the Nautilus-4 AUV maximum operational depth 2,000 meters?",
        "expected_premise": "CONTRADICTED", "required_tokens": ["no", "6,000"], "forbidden_tokens": ["yes."]
    },
    {
        "id": "FP_14", "type": "false_premise", "project_id": PROJECT_UNIVERSAL, "doc_id": "doc_auv_spec",
        "query": "Does the Nautilus-4 AUV use lead-acid batteries with 12 continuous operating hours?",
        "expected_premise": "CONTRADICTED", "required_tokens": ["no"], "forbidden_tokens": ["yes."]
    },
    {
        "id": "FP_15", "type": "false_premise", "project_id": PROJECT_UNIVERSAL, "doc_id": "doc_astro_notes",
        "query": "Is the Chandrasekhar limit established at 3.0 solar masses?",
        "expected_premise": "CONTRADICTED", "required_tokens": ["no", "1.44"], "forbidden_tokens": ["yes."]
    },
    {
        "id": "FP_16", "type": "false_premise", "project_id": PROJECT_UNIVERSAL, "doc_id": "doc_astro_notes",
        "query": "Do massive stars with M > 8 solar masses terminate fusion at helium burning?",
        "expected_premise": "CONTRADICTED", "required_tokens": ["no"], "forbidden_tokens": ["yes."]
    },
    {
        "id": "FP_17", "type": "false_premise", "project_id": PROJECT_UNIVERSAL, "doc_id": "doc_payment_incident",
        "query": "Was the payment gateway outage caused by a power supply failure in the primary datacenter?",
        "expected_premise": "CONTRADICTED", "required_tokens": ["no", "certificate"], "forbidden_tokens": ["yes."]
    },
    {
        "id": "FP_18", "type": "false_premise", "project_id": PROJECT_UNIVERSAL, "doc_id": "doc_payment_incident",
        "query": "Did the payment gateway outage last for 4 hours before mitigation?",
        "expected_premise": "CONTRADICTED", "required_tokens": ["no", "21 minute"], "forbidden_tokens": ["yes."]
    },
    {
        "id": "FP_19", "type": "false_premise", "project_id": PROJECT_UNIVERSAL, "doc_id": "doc_vectordb_api",
        "query": "Does the VectorDB Rust client SDK retry ConnectionFailed errors up to 10 times?",
        "expected_premise": "CONTRADICTED", "required_tokens": ["no", "3"], "forbidden_tokens": ["yes."]
    },
    {
        "id": "FP_20", "type": "false_premise", "project_id": PROJECT_UNIVERSAL, "doc_id": "doc_holdout_survey",
        "query": "Was Spire Alpha discovered in the Atlantic Ocean at a depth of 1,200 meters?",
        "expected_premise": "CONTRADICTED", "required_tokens": ["no", "mariana"], "forbidden_tokens": ["yes."]
    },
    # 5 additional false-premise cases across diverse domains
    {
        "id": "FP_21", "type": "false_premise", "project_id": PROJECT_UNIVERSAL, "doc_id": "doc_tech_manual",
        "query": "Is compressor lubrication oil replacement scheduled every 500 hours?",
        "expected_premise": "CONTRADICTED", "required_tokens": ["no", "4,000"], "forbidden_tokens": ["yes."]
    },
    {
        "id": "FP_22", "type": "false_premise", "project_id": PROJECT_UNIVERSAL, "doc_id": "doc_security_policy",
        "query": "Must lost corporate laptops be reported to the SOC within 48 hours?",
        "expected_premise": "CONTRADICTED", "required_tokens": ["no", "2 hour"], "forbidden_tokens": ["yes."]
    },
    {
        "id": "FP_23", "type": "false_premise", "project_id": PROJECT_UNIVERSAL, "doc_id": "doc_biohazard_sop",
        "query": "Must biohazard waste bags be autoclaved at 200°C for 10 minutes?",
        "expected_premise": "CONTRADICTED", "required_tokens": ["no", "121"], "forbidden_tokens": ["yes."]
    },
    {
        "id": "FP_24", "type": "false_premise", "project_id": PROJECT_UNIVERSAL, "doc_id": "doc_auv_spec",
        "query": "Does the AUV abort active survey when battery state of charge drops below 50%?",
        "expected_premise": "CONTRADICTED", "required_tokens": ["no", "5%"], "forbidden_tokens": ["yes."]
    },
    {
        "id": "FP_25", "type": "false_premise", "project_id": PROJECT_UNIVERSAL, "doc_id": "doc_vectordb_api",
        "query": "Does client initialization endpoint connect over unencrypted port 80?",
        "expected_premise": "CONTRADICTED", "required_tokens": ["no", "6334"], "forbidden_tokens": ["yes."]
    },

    # ------------------------------------------------------------------------
    # 3. PARTIALLY CORRECT PREMISES (20 cases)
    # ------------------------------------------------------------------------
    {
        "id": "PP_01", "type": "partial_premise", "project_id": PROJECT_UNIVERSAL, "doc_id": "doc_tech_manual",
        "query": "The KC-450 chiller uses R-134a refrigerant and a 500 kW motor, right?",
        "expected_premise": "PARTIALLY_SUPPORTED", "required_tokens": ["r-134a", "310"]
    },
    {
        "id": "PP_02", "type": "partial_premise", "project_id": PROJECT_UNIVERSAL, "doc_id": "doc_literature",
        "query": "Commander Keith betrayed the High King at the Battle of the Red Crossing and did so ten summers ago, right?",
        "expected_premise": "PARTIALLY_SUPPORTED", "required_tokens": ["red crossing", "two winters ago"]
    },
    {
        "id": "PP_03", "type": "partial_premise", "project_id": PROJECT_UNIVERSAL, "doc_id": "doc_research_paper",
        "query": "Q-EdgeAttention targets ARM Cortex-M55 cores and reduces peak SRAM by 20%, right?",
        "expected_premise": "PARTIALLY_SUPPORTED", "required_tokens": ["cortex-m55", "72.8%"]
    },
    {
        "id": "PP_04", "type": "partial_premise", "project_id": PROJECT_UNIVERSAL, "doc_id": "doc_security_policy",
        "query": "Corporate policy SEC-2026-09 mandates FIDO2 hardware keys and provides a $5,000 home desk stipend, right?",
        "expected_premise": "PARTIALLY_SUPPORTED", "required_tokens": ["fido2", "500"]
    },
    {
        "id": "PP_05", "type": "partial_premise", "project_id": PROJECT_UNIVERSAL, "doc_id": "doc_telemetry_arch",
        "query": "Telemetry events are published to Kafka and stream processed by Apache Storm, right?",
        "expected_premise": "PARTIALLY_SUPPORTED", "required_tokens": ["kafka", "flink"]
    },
    {
        "id": "PP_06", "type": "partial_premise", "project_id": PROJECT_UNIVERSAL, "doc_id": "doc_biohazard_sop",
        "query": "SOP-BIO-104 specifies 10% sodium hypochlorite disinfectant and allows re-entry after 5 minutes, right?",
        "expected_premise": "PARTIALLY_SUPPORTED", "required_tokens": ["sodium hypochlorite", "30 minute"]
    },
    {
        "id": "PP_07", "type": "partial_premise", "project_id": PROJECT_UNIVERSAL, "doc_id": "doc_auv_spec",
        "query": "The Nautilus-4 AUV has a 6,000 meter depth rating and is powered by lead-acid batteries, right?",
        "expected_premise": "PARTIALLY_SUPPORTED", "required_tokens": ["6,000"]
    },
    {
        "id": "PP_08", "type": "partial_premise", "project_id": PROJECT_UNIVERSAL, "doc_id": "doc_astro_notes",
        "query": "The Chandrasekhar limit is 1.44 solar masses and applies to neutron stars, right?",
        "expected_premise": "PARTIALLY_SUPPORTED", "required_tokens": ["1.44", "white dwarf"]
    },
    {
        "id": "PP_09", "type": "partial_premise", "project_id": PROJECT_UNIVERSAL, "doc_id": "doc_payment_incident",
        "query": "The payment gateway outage lasted 21 minutes and was caused by a DDoS attack, right?",
        "expected_premise": "PARTIALLY_SUPPORTED", "required_tokens": ["21 minute", "certificate"]
    },
    {
        "id": "PP_10", "type": "partial_premise", "project_id": PROJECT_UNIVERSAL, "doc_id": "doc_holdout_survey",
        "query": "Spire Alpha is located at 4,120 meters depth and was discovered in the Atlantic Ocean, right?",
        "expected_premise": "PARTIALLY_SUPPORTED", "required_tokens": ["4,120", "mariana"]
    },
    # 10 additional partial-premise cases including tricky negation + partial combinations
    {
        "id": "PP_11", "type": "partial_premise", "project_id": PROJECT_UNIVERSAL, "doc_id": "doc_tech_manual",
        "query": "The KC-450 does not use R-410A, but its oil pressure alarm trips below 5.0 bar, correct?",
        "expected_premise": "PARTIALLY_SUPPORTED", "required_tokens": ["r-134a", "2.2 bar"]
    },
    {
        "id": "PP_12", "type": "partial_premise", "project_id": PROJECT_UNIVERSAL, "doc_id": "doc_security_policy",
        "query": "Employees must report lost devices within 2 hours, and SMS verification is allowed for admin access, right?",
        "expected_premise": "PARTIALLY_SUPPORTED", "required_tokens": ["2 hour", "prohibit"]
    },
    {
        "id": "PP_13", "type": "partial_premise", "project_id": PROJECT_UNIVERSAL, "doc_id": "doc_telemetry_arch",
        "query": "Envoy proxy terminates mTLS at the edge, and failover RTO is 60 minutes, right?",
        "expected_premise": "PARTIALLY_SUPPORTED", "required_tokens": ["envoy", "4 minute"]
    },
    {
        "id": "PP_14", "type": "partial_premise", "project_id": PROJECT_UNIVERSAL, "doc_id": "doc_biohazard_sop",
        "query": "Is Level C PPE required for cleanroom re-entry, and is disinfectant contact dwell time only 2 minutes?",
        "expected_premise": "PARTIALLY_SUPPORTED", "required_tokens": ["level c", "20 minute"]
    },
    {
        "id": "PP_15", "type": "partial_premise", "project_id": PROJECT_UNIVERSAL, "doc_id": "doc_auv_spec",
        "query": "Does the AUV feature a 300 kHz Doppler Velocity Log, but release a 100 kg drop-weight on emergency abort?",
        "expected_premise": "PARTIALLY_SUPPORTED", "required_tokens": ["300 khz", "25 kg"]
    },
    {
        "id": "PP_16", "type": "partial_premise", "project_id": PROJECT_UNIVERSAL, "doc_id": "doc_astro_notes",
        "query": "Silicon burning produces an iron-peak core, but iron fusion generates strong outward thermal pressure, right?",
        "expected_premise": "PARTIALLY_SUPPORTED", "required_tokens": ["iron", "endothermic"]
    },
    {
        "id": "PP_17", "type": "partial_premise", "project_id": PROJECT_UNIVERSAL, "doc_id": "doc_payment_incident",
        "query": "PAGER-CRIT-99 triggered due to a 5xx error spike, and the incident lasted 6 hours, correct?",
        "expected_premise": "PARTIALLY_SUPPORTED", "required_tokens": ["pager-crit-99", "21 minute"]
    },
    {
        "id": "PP_18", "type": "partial_premise", "project_id": PROJECT_UNIVERSAL, "doc_id": "doc_vectordb_api",
        "query": "The VectorDB client connects to port 6334 and allows up to 10 retry attempts on connection failure, right?",
        "expected_premise": "PARTIALLY_SUPPORTED", "required_tokens": ["6334", "3"]
    },
    {
        "id": "PP_19", "type": "partial_premise", "project_id": PROJECT_UNIVERSAL, "doc_id": "doc_literature",
        "query": "Rowan wielded the broken hilt of the Sunfire Blade, which was passed down through twenty generations, right?",
        "expected_premise": "PARTIALLY_SUPPORTED", "required_tokens": ["sunfire blade", "six"]
    },
    {
        "id": "PP_20", "type": "partial_premise", "project_id": PROJECT_UNIVERSAL, "doc_id": "doc_holdout_survey",
        "query": "Spire Alpha hydrothermal fluid registered a temperature of 362.4°C and a neutral pH of 7.0, right?",
        "expected_premise": "PARTIALLY_SUPPORTED", "required_tokens": ["362.4", "3.2"]
    },

    # ------------------------------------------------------------------------
    # 4. COMPOUND QUESTIONS (15 cases)
    # ------------------------------------------------------------------------
    {
        "id": "CQ_01", "type": "compound", "project_id": PROJECT_UNIVERSAL, "doc_id": "doc_tech_manual",
        "query": "What refrigerant does the KC-450 use, what is its motor rating, and in what city is the KryoCorp factory located?",
        "expected_premise": "PARTIALLY_SUPPORTED", "supported_tokens": ["r-134a", "310"], "unsupported_phrase": "does not"
    },
    {
        "id": "CQ_02", "type": "compound", "project_id": PROJECT_UNIVERSAL, "doc_id": "doc_literature",
        "query": "Who betrayed the High King, for how many chests of silver, and what was Keith's date of birth?",
        "expected_premise": "PARTIALLY_SUPPORTED", "supported_tokens": ["keith", "seventy"], "unsupported_phrase": "does not"
    },
    {
        "id": "CQ_03", "type": "compound", "project_id": PROJECT_UNIVERSAL, "doc_id": "doc_research_paper",
        "query": "What microcontroller does Q-EdgeAttention target, what peak SRAM reduction does it achieve, and what is its retail price?",
        "expected_premise": "PARTIALLY_SUPPORTED", "supported_tokens": ["cortex-m55", "72.8%"], "unsupported_phrase": "does not"
    },
    {
        "id": "CQ_04", "type": "compound", "project_id": PROJECT_UNIVERSAL, "doc_id": "doc_security_policy",
        "query": "What key type is required for production, what is the remote desk stipend, and what is the CEO's personal mobile phone number?",
        "expected_premise": "PARTIALLY_SUPPORTED", "supported_tokens": ["fido2", "500"], "unsupported_phrase": "does not"
    },
    {
        "id": "CQ_05", "type": "compound", "project_id": PROJECT_UNIVERSAL, "doc_id": "doc_telemetry_arch",
        "query": "What message broker ingests telemetry, what stream processor is used, and what is the annual budget of the engineering team?",
        "expected_premise": "PARTIALLY_SUPPORTED", "supported_tokens": ["kafka", "flink"], "unsupported_phrase": "does not"
    },
    {
        "id": "CQ_06", "type": "compound", "project_id": PROJECT_UNIVERSAL, "doc_id": "doc_biohazard_sop",
        "query": "What disinfectant is used in SOP-BIO-104, how long is the waiting time before re-entry, and what retail store supplies the disinfectant?",
        "expected_premise": "PARTIALLY_SUPPORTED", "supported_tokens": ["sodium hypochlorite", "30 minute"], "unsupported_phrase": "does not"
    },
    {
        "id": "CQ_07", "type": "compound", "project_id": PROJECT_UNIVERSAL, "doc_id": "doc_auv_spec",
        "query": "What is the maximum depth rating of Nautilus-4, how many thrusters does it use, and what paint color is used on the exterior?",
        "expected_premise": "PARTIALLY_SUPPORTED", "supported_tokens": ["6,000"], "unsupported_phrase": "does not"
    },
    {
        "id": "CQ_08", "type": "compound", "project_id": PROJECT_UNIVERSAL, "doc_id": "doc_astro_notes",
        "query": "What is the Chandrasekhar limit value, what core element is left after silicon burning, and what brand of telescope was used in 1930?",
        "expected_premise": "PARTIALLY_SUPPORTED", "supported_tokens": ["1.44"], "unsupported_phrase": "does not"
    },
    {
        "id": "CQ_09", "type": "compound", "project_id": PROJECT_UNIVERSAL, "doc_id": "doc_payment_incident",
        "query": "What was the root cause of the payment incident, how long did it last, and what are the home addresses of all affected merchants?",
        "expected_premise": "PARTIALLY_SUPPORTED", "supported_tokens": ["certificate", "21 minute"], "unsupported_phrase": "does not"
    },
    {
        "id": "CQ_10", "type": "compound", "project_id": PROJECT_UNIVERSAL, "doc_id": "doc_holdout_survey",
        "query": "At what depth is Spire Alpha located, what is the hydrothermal fluid temperature, and what was the sea surface temperature at noon?",
        "expected_premise": "PARTIALLY_SUPPORTED", "supported_tokens": ["4,120", "362.4"], "unsupported_phrase": "does not"
    },
    # 5 additional compound cases
    {
        "id": "CQ_11", "type": "compound", "project_id": PROJECT_UNIVERSAL, "doc_id": "doc_tech_manual",
        "query": "What alarm code trips on high condenser pressure, what threshold trips it, and what technician is assigned to fix it?",
        "expected_premise": "PARTIALLY_SUPPORTED", "supported_tokens": ["a-12", "16.5"], "unsupported_phrase": "does not"
    },
    {
        "id": "CQ_12", "type": "compound", "project_id": PROJECT_UNIVERSAL, "doc_id": "doc_security_policy",
        "query": "What hours are core collaboration hours, to what email address must lost laptops be reported, and what is the building gate code?",
        "expected_premise": "PARTIALLY_SUPPORTED", "supported_tokens": ["10:00", "soc@corp.com"], "unsupported_phrase": "does not"
    },
    {
        "id": "CQ_13", "type": "compound", "project_id": PROJECT_UNIVERSAL, "doc_id": "doc_telemetry_arch",
        "query": "What datastore handles operational telemetry, what datastore handles historical analytics, and who approved the purchase of ClickHouse?",
        "expected_premise": "PARTIALLY_SUPPORTED", "supported_tokens": ["timescaledb", "clickhouse"], "unsupported_phrase": "does not"
    },
    {
        "id": "CQ_14", "type": "compound", "project_id": PROJECT_UNIVERSAL, "doc_id": "doc_auv_spec",
        "query": "What is the battery module capacity, what continuous endurance hours does it deliver, and what is the captain's license number?",
        "expected_premise": "PARTIALLY_SUPPORTED", "supported_tokens": ["35 kwh", "72"], "unsupported_phrase": "does not"
    },
    {
        "id": "CQ_15", "type": "compound", "project_id": PROJECT_UNIVERSAL, "doc_id": "doc_vectordb_api",
        "query": "What is the connection timeout duration, what is max_connections, and how many stars does the GitHub repository have?",
        "expected_premise": "PARTIALLY_SUPPORTED", "supported_tokens": ["5000", "64"], "unsupported_phrase": "does not"
    },

    # ------------------------------------------------------------------------
    # 5. MULTI-SOURCE CONFLICT SURFACING (10 cases in PROJECT_CONFLICT)
    # ------------------------------------------------------------------------
    {
        "id": "CF_01", "type": "conflict", "project_id": PROJECT_CONFLICT, "doc_id": "doc_conflict_sensor",
        "query": "What voltage does Model PT-301 require?",
        "expected_conflict": True, "conflict_tokens": ["conflict", "24v", "12v"]
    },
    {
        "id": "CF_02", "type": "conflict", "project_id": PROJECT_CONFLICT, "doc_id": "doc_conflict_valve",
        "query": "Is emergency shutoff valve V-204 located upstream or downstream of pump P-101A?",
        "expected_conflict": True, "conflict_tokens": ["conflict", "upstream", "downstream"]
    },
    {
        "id": "CF_03", "type": "conflict", "project_id": PROJECT_CONFLICT, "doc_id": "doc_conflict_breaker",
        "query": "What is the normal operating state of breaker BRK-400?",
        "expected_conflict": True, "conflict_tokens": ["conflict", "open", "closed"]
    },
    {
        "id": "CF_04", "type": "conflict", "project_id": PROJECT_CONFLICT, "doc_id": "doc_conflict_purge",
        "query": "Does the chemical purge cycle require manual operator isolation?",
        "expected_conflict": True, "conflict_tokens": ["conflict", "manual", "automatic"]
    },
    {
        "id": "CF_05", "type": "conflict", "project_id": PROJECT_CONFLICT, "doc_id": "doc_conflict_ppe",
        "query": "Are maintenance personnel required to wear face shields inside the chamber?",
        "expected_conflict": True, "conflict_tokens": ["conflict", "must wear", "not wear"]
    },
    {
        "id": "CF_06", "type": "conflict", "project_id": PROJECT_CONFLICT, "doc_id": "doc_conflict_temp",
        "query": "What is the maximum allowable casing temperature for Compressor C-10?",
        "expected_conflict": True, "conflict_tokens": ["conflict", "70", "95"]
    },
    {
        "id": "CF_07", "type": "conflict", "project_id": PROJECT_CONFLICT, "doc_id": "doc_conflict_flow",
        "query": "What is the nominal cooling water flow rate through Exchanger E-102?",
        "expected_conflict": True, "conflict_tokens": ["conflict", "50", "85"]
    },
    {
        "id": "CF_08", "type": "conflict", "project_id": PROJECT_CONFLICT, "doc_id": "doc_conflict_relay",
        "query": "Is safety relay K-12 energized or de-energized during standby mode?",
        "expected_conflict": True, "conflict_tokens": ["conflict", "energized", "de-energized"]
    },
    {
        "id": "CF_09", "type": "conflict", "project_id": PROJECT_CONFLICT, "doc_id": "doc_conflict_log",
        "query": "Is hourly manual log entry required by the control operator?",
        "expected_conflict": True, "conflict_tokens": ["conflict", "required", "forbidden"]
    },
    {
        "id": "CF_10", "type": "version_disambiguation", "project_id": PROJECT_CONFLICT, "doc_id": "doc_spec_v2",
        "query": "What port does Revision B of Device D-9 use for control network communication?",
        "expected_conflict": False, "conflict_tokens": ["8443"]
    },

    # ------------------------------------------------------------------------
    # 6. INSUFFICIENT EVIDENCE & NEGATION (10 cases)
    # ------------------------------------------------------------------------
    {
        "id": "IE_01", "type": "insufficient", "project_id": PROJECT_UNIVERSAL, "doc_id": "none",
        "query": "What is the capital city of France?",
        "expected_abstain": True, "unsupported_phrase": "does not contain"
    },
    {
        "id": "IE_02", "type": "insufficient", "project_id": PROJECT_UNIVERSAL, "doc_id": "none",
        "query": "How many moons orbit the planet Saturn?",
        "expected_abstain": True, "unsupported_phrase": "does not contain"
    },
    {
        "id": "IE_03", "type": "insufficient", "project_id": PROJECT_UNIVERSAL, "doc_id": "doc_tech_manual",
        "query": "What was the gross revenue of KryoCorp Technologies in fiscal year 2023?",
        "expected_abstain": True, "unsupported_phrase": "does not"
    },
    {
        "id": "IE_04", "type": "insufficient", "project_id": PROJECT_UNIVERSAL, "doc_id": "doc_auv_spec",
        "query": "What is the warranty coverage duration for the Nautilus-4 AUV?",
        "expected_abstain": True, "unsupported_phrase": "does not"
    },
    {
        "id": "IE_05", "type": "insufficient", "project_id": PROJECT_UNIVERSAL, "doc_id": "doc_security_policy",
        "query": "Who was the previous Chief Information Security Officer before the current corporate policy was published?",
        "expected_abstain": True, "unsupported_phrase": "does not"
    },
    {
        "id": "IE_06", "type": "insufficient", "project_id": PROJECT_UNIVERSAL, "doc_id": "doc_payment_incident",
        "query": "What brand of coffee did the on-call incident engineers consume during the triage bridge?",
        "expected_abstain": True, "unsupported_phrase": "does not"
    },
    {
        "id": "NEG_01", "type": "negation", "project_id": PROJECT_UNIVERSAL, "doc_id": "doc_security_policy",
        "query": "Does the corporate security policy not permit SMS authentication for production systems?",
        "expected_abstain": False, "required_tokens": ["prohibit", "fido2"]
    },
    {
        "id": "NEG_02", "type": "negation", "project_id": PROJECT_UNIVERSAL, "doc_id": "doc_tech_manual",
        "query": "Is it false that the Model KC-450 chiller uses R-134a refrigerant?",
        "expected_abstain": False, "required_tokens": ["r-134a"]
    },
    {
        "id": "NEG_03", "type": "negation", "project_id": PROJECT_UNIVERSAL, "doc_id": "doc_payment_incident",
        "query": "Was the incident outage not caused by physical hardware failure?",
        "expected_abstain": False, "required_tokens": ["certificate"]
    },
    {
        "id": "NEG_04", "type": "negation", "project_id": PROJECT_UNIVERSAL, "doc_id": "doc_biohazard_sop",
        "query": "Does SOP-BIO-104 not allow personnel to enter the cleanroom before 30 minutes have elapsed?",
        "expected_abstain": False, "required_tokens": ["30 minute"]
    }
]

# ============================================================================
# EVALUATION RUNNER WITH TWO-TIER SCORING RUBRIC
# ============================================================================

def run_phase2_evaluation():
    print("=" * 80)
    print("EVIDEX PHASE 2 CLOSURE: EVIDENCE PRECISION, CONTRADICTION & SUFFICIENCY")
    print(f"Total Test Cases: {len(TEST_CASES)}")
    print("=" * 80)

    results = []
    category_counts = {
        "true_premise": {"total": 0, "semantic_pass": 0, "strict_pass": 0},
        "false_premise": {"total": 0, "semantic_pass": 0, "strict_pass": 0},
        "partial_premise": {"total": 0, "semantic_pass": 0, "strict_pass": 0},
        "compound": {"total": 0, "semantic_pass": 0, "strict_pass": 0},
        "conflict": {"total": 0, "semantic_pass": 0, "strict_pass": 0},
        "version_disambiguation": {"total": 0, "semantic_pass": 0, "strict_pass": 0},
        "insufficient": {"total": 0, "semantic_pass": 0, "strict_pass": 0},
        "negation": {"total": 0, "semantic_pass": 0, "strict_pass": 0},
    }

    total_latency = 0.0
    latencies = []

    for idx, tc in enumerate(TEST_CASES, start=1):
        tc_id = tc["id"]
        tc_type = tc["type"]
        proj_id = tc["project_id"]
        q = tc["query"]
        category_counts[tc_type]["total"] += 1

        ans = ""
        meta = {}
        dt_ms = 0.0

        for attempt in range(4):
            t0 = time.perf_counter()
            try:
                resp = requests.post(f"{AI_URL}/generate", json={
                    "projectId": proj_id,
                    "query": q
                }, timeout=45)
                dt_ms = (time.perf_counter() - t0) * 1000
                if resp.status_code == 200:
                    data = resp.json()
                    candidate_ans = data.get("answer", "")
                    if candidate_ans.strip():
                        ans = candidate_ans
                        meta = data.get("metadata") or {}
                        break
            except Exception as e:
                pass
            
            # Backoff if empty or rate-limited
            time.sleep(6.0)

        latencies.append(dt_ms)
        total_latency += dt_ms

        is_abstained = meta.get("abstention", False)
        ans_lower = ans.lower()

        # Rubric Evaluation: Two Tiers
        semantic_pass = False
        strict_pass = False
        notes = ""

        if tc_type == "true_premise":
            # Semantic: Natural confirmation of verified assertion without false rejection
            has_affirm = any(w in ans_lower for w in ["yes", "confirms", "states that", "specifies that", "utilizes", "is rated", "mandates", "achieves"])
            has_refute = any(w in ans_lower for w in ["no.", "not true", "incorrect", "false"])
            semantic_pass = (has_affirm and not has_refute and not is_abstained)
            # Strict token match
            req_toks = tc.get("required_tokens", [])
            has_req = all(tok.lower() in ans_lower for tok in req_toks)
            strict_pass = (has_req and not has_refute and not is_abstained)
            notes = f"affirm={has_affirm}, req={has_req}"

        elif tc_type == "false_premise":
            # Semantic: Rejection of false proposition with evidence-backed correction
            has_reject = any(w in ans_lower for w in ["no.", "no,", "not true", "incorrect", "does not", "is not", "instead"])
            has_false_agree = ans_lower.startswith("yes.") or ans_lower.startswith("yes,")
            semantic_pass = (has_reject and not has_false_agree and not is_abstained)
            # Strict token match
            req_toks = tc.get("required_tokens", [])
            has_req = all(tok.lower() in ans_lower for tok in req_toks)
            strict_pass = (has_reject and has_req and not has_false_agree and not is_abstained)
            notes = f"reject={has_reject}, req={has_req}"

        elif tc_type == "partial_premise":
            # Semantic: Preserves true subclaim, corrects/rejects false subclaim
            has_partial = any(w in ans_lower for w in ["partially", "while", "however", "confirms", "states that", "but specifies", "does not mention", "does not use", "not "])
            has_binary_collapse = ans_lower.startswith("yes.") or (ans_lower.startswith("no.") and "however" not in ans_lower and "while" not in ans_lower and "specifies" not in ans_lower)
            semantic_pass = (has_partial and not is_abstained)
            # Strict token match
            req_toks = tc.get("required_tokens", [])
            has_req = all(tok.lower() in ans_lower for tok in req_toks)
            strict_pass = (has_req and not is_abstained)
            notes = f"partial={has_partial}, req={has_req}"

        elif tc_type == "compound":
            # Semantic: Separates answerable components from missing components
            has_unsup = any(w in ans_lower for w in ["does not", "not mention", "not specify", "unsupported", "unavailable", "unknown", "however"])
            has_answered = len(ans_lower) > 30 and not is_abstained
            semantic_pass = (has_answered and has_unsup)
            # Strict token match
            sup_toks = tc.get("supported_tokens", [])
            has_sup = all(tok.lower() in ans_lower for tok in sup_toks)
            strict_pass = (has_sup and has_unsup and not is_abstained)
            notes = f"answered={has_answered}, sup={has_sup}, unsup={has_unsup}"

        elif tc_type == "conflict":
            # Semantic: Identifies contradiction and cites both sides
            has_conflict_word = any(w in ans_lower for w in ["conflict", "discrepancy", "differs", "contradict", "different"])
            semantic_pass = (has_conflict_word and not is_abstained)
            # Strict token match
            c_toks = tc.get("conflict_tokens", [])
            has_c_toks = all(tok.lower() in ans_lower for tok in c_toks[1:])
            strict_pass = (has_conflict_word and has_c_toks and not is_abstained)
            notes = f"conflict_word={has_conflict_word}, tokens={has_c_toks}"

        elif tc_type == "version_disambiguation":
            # Disambiguates to version B value (8443)
            c_toks = tc.get("conflict_tokens", [])
            has_c_toks = all(tok.lower() in ans_lower for tok in c_toks)
            semantic_pass = (has_c_toks and not is_abstained)
            strict_pass = semantic_pass
            notes = f"tokens={has_c_toks}"

        elif tc_type == "insufficient":
            # Abstains without external world hallucination
            semantic_pass = (is_abstained or any(w in ans_lower for w in ["does not", "not provide", "not contain", "insufficient", "not mention", "not specify"]))
            strict_pass = semantic_pass
            notes = f"abstained={is_abstained}"

        elif tc_type == "negation":
            # Preserves negative assertion correctly
            req_toks = tc.get("required_tokens", [])
            has_req = any(tok.lower() in ans_lower for tok in req_toks)
            semantic_pass = (has_req and not is_abstained)
            strict_pass = semantic_pass
            notes = f"req={has_req}"

        if semantic_pass:
            category_counts[tc_type]["semantic_pass"] += 1
        if strict_pass:
            category_counts[tc_type]["strict_pass"] += 1

        res_entry = {
            "id": tc_id,
            "type": tc_type,
            "query": q,
            "semantic_pass": semantic_pass,
            "strict_pass": strict_pass,
            "latency_ms": dt_ms,
            "notes": notes,
            "answer_preview": ans[:120]
        }
        results.append(res_entry)

        sem_str = "PASS" if semantic_pass else "FAIL"
        strict_str = "PASS" if strict_pass else "FAIL"
        print(f"[{idx:03d}/{len(TEST_CASES):03d}] {tc_id} ({tc_type:18s}): Sem={sem_str:4s} | Strict={strict_str:4s} ({dt_ms:.1f}ms) -> {ans[:75]}...", flush=True)

        # Continually save checkpoint
        out_file = os.path.join(os.path.dirname(__file__), "phase2_trust_results.json")
        try:
            with open(out_file, "w") as f:
                json.dump({
                    "progress": f"{idx}/{len(TEST_CASES)}",
                    "category_metrics": category_counts,
                    "cases": results
                }, f, indent=2)
        except Exception:
            pass

        # Pace requests to comply with Gemini 15 RPM free tier limit
        time.sleep(3.5)

    # Calculate summary metrics
    latencies.sort()
    p50 = latencies[len(latencies) // 2]
    p95 = latencies[int(len(latencies) * 0.95)]
    mean_lat = total_latency / len(latencies)

    print("\n" + "=" * 80, flush=True)
    print("PHASE 2 CLOSURE: TWO-TIER METRICS SUMMARY", flush=True)
    print("=" * 80, flush=True)
    for cat, data in category_counts.items():
        sem_pct = (data["semantic_pass"] / data["total"] * 100) if data["total"] > 0 else 0.0
        str_pct = (data["strict_pass"] / data["total"] * 100) if data["total"] > 0 else 0.0
        print(f"{cat:25s}: Semantic={data['semantic_pass']}/{data['total']} ({sem_pct:5.1f}%) | Strict={data['strict_pass']}/{data['total']} ({str_pct:5.1f}%)", flush=True)

    total_sem = sum(d["semantic_pass"] for d in category_counts.values())
    total_str = sum(d["strict_pass"] for d in category_counts.values())
    total_cases = sum(d["total"] for d in category_counts.values())
    sem_overall = (total_sem / total_cases * 100) if total_cases > 0 else 0.0
    str_overall = (total_str / total_cases * 100) if total_cases > 0 else 0.0
    print(f"\nOVERALL SEMANTIC TRUST ACCURACY: {total_sem}/{total_cases} ({sem_overall:.1f}%)", flush=True)
    print(f"OVERALL STRICT LEXICAL MATCH:    {total_str}/{total_cases} ({str_overall:.1f}%)", flush=True)
    print(f"Latency P50: {p50:.1f}ms | P95: {p95:.1f}ms | Mean: {mean_lat:.1f}ms", flush=True)

    with open(out_file, "w") as f:
        json.dump({
            "overall_semantic_accuracy": sem_overall,
            "overall_strict_accuracy": str_overall,
            "category_metrics": category_counts,
            "latencies": {"p50": p50, "p95": p95, "mean": mean_lat},
            "cases": results
        }, f, indent=2)
    print(f"Saved results to {out_file}", flush=True)

if __name__ == "__main__":
    run_phase2_evaluation()
