import json
import random
from pathlib import Path
from typing import List, Dict

# Set deterministic seed for scientific reproducibility
random.seed(42)

# Root datasets directory (D:\GroundGuard\datasets)
REPO_ROOT = Path(__file__).resolve().parent.parent.parent.parent
DATASETS_DIR = REPO_ROOT / "datasets"

# ---------------------------------------------------------------------------
# 1. TRAINING & VALIDATION KNOWLEDGE SEEDS (Domains: Finance, Tech, Pharma)
# ---------------------------------------------------------------------------
TRAIN_VAL_SEEDS = [
    {
        "entity": "Apex Cloud Corp",
        "alt_entity": "Zenith Data Systems",
        "metric": "annual recurring revenue",
        "val": "₹120 Cr",
        "alt_val": "₹180 Cr",
        "year": "2024",
        "alt_year": "2022",
        "action": "expanded its data center footprint",
        "region_pair": ("Mumbai and Chennai", "Mumbai, Chennai, and Hyderabad"),
        "cause_pair": (
            "Enterprise subscriptions surged after the release of version 4.0.",
            "The release of version 4.0 directly caused enterprise subscriptions to surge."
        ),
        "unsupported_extra": "and achieved a 99.99% customer retention rate",
        "paraphrase": "In 2024, Apex Cloud Corp recorded ₹120 Cr in recurring yearly revenue."
    },
    {
        "entity": "BioVanguard Labs",
        "alt_entity": "Novartis Oncology",
        "metric": "Phase-3 clinical efficacy",
        "val": "84%",
        "alt_val": "62%",
        "year": "2023",
        "alt_year": "2025",
        "action": "received regulatory clearance",
        "region_pair": ("Germany and Switzerland", "Germany, Switzerland, and France"),
        "cause_pair": (
            "Patient recovery times improved following the revised dosage protocol.",
            "The revised dosage protocol was the sole cause of improved patient recovery times."
        ),
        "unsupported_extra": "while eliminating all side effects in elderly patients",
        "paraphrase": "During the 2023 trials, BioVanguard Labs demonstrated an 84% efficacy rate in Phase-3."
    },
    {
        "entity": "FinEdge Payments",
        "alt_entity": "Stripe India",
        "metric": "net transaction volume",
        "val": "$450 million",
        "alt_val": "$750 million",
        "year": "2024",
        "alt_year": "2021",
        "action": "launched cross-border UPI settlements",
        "region_pair": ("Singapore and UAE", "Singapore, UAE, and Malaysia"),
        "cause_pair": (
            "Merchant onboarding doubled after transaction fees were lowered.",
            "Lowering transaction fees guaranteed the doubling of merchant onboarding."
        ),
        "unsupported_extra": "and captured 40% of the Southeast Asian market",
        "paraphrase": "Total net payment volume processed by FinEdge Payments reached $450M in 2024."
    },
    {
        "entity": "QuantumCompute AI",
        "alt_entity": "Anthropic Research",
        "metric": "training cluster compute capacity",
        "val": "16,000 GPUs",
        "alt_val": "32,000 GPUs",
        "year": "2024",
        "alt_year": "2023",
        "action": "open-sourced its sparse mixture-of-experts model",
        "region_pair": ("California and Texas", "California, Texas, and Virginia"),
        "cause_pair": (
            "Inference latency dropped by 30% after quantization was enabled.",
            "Enabling quantization directly forced inference latency to drop by 30%."
        ),
        "unsupported_extra": "reducing total data center electricity costs by $10M",
        "paraphrase": "In 2024, QuantumCompute AI scaled its training cluster to 16,000 GPUs."
    },
    {
        "entity": "Mercator Logistics",
        "alt_entity": "Maersk Freight",
        "metric": "operating profit margin",
        "val": "18.5%",
        "alt_val": "28.5%",
        "year": "2023",
        "alt_year": "2024",
        "action": "automated its port warehousing facilities",
        "region_pair": ("Rotterdam and Antwerp", "Rotterdam, Antwerp, and Hamburg"),
        "cause_pair": (
            "Delivery delays declined after AI route optimization was deployed.",
            "AI route optimization was the exclusive cause of declining delivery delays."
        ),
        "unsupported_extra": "and reduced maritime carbon emissions by half",
        "paraphrase": "Mercator Logistics posted an 18.5% operating margin for the 2023 fiscal year."
    }
]

# ---------------------------------------------------------------------------
# 2. UNSEEN TEST BENCHMARK SEEDS (Domains: Aerospace, Clean Energy, Chips)
#    Strictly disjoint entities & domains to prevent data leakage!
# ---------------------------------------------------------------------------
TEST_BENCHMARK_SEEDS = [
    {
        "entity": "Orbital Dynamics Aerospace",
        "alt_entity": "SpaceX Starshield",
        "metric": "low-earth orbit payload capacity",
        "val": "22 metric tons",
        "alt_val": "35 metric tons",
        "year": "2024",
        "alt_year": "2026",
        "action": "completed static-fire qualification tests",
        "region_pair": ("Cape Canaveral and Vandenberg", "Cape Canaveral, Vandenberg, and Kourou"),
        "cause_pair": (
            "Booster reusability increased after thermal shielding was upgraded.",
            "Upgrading thermal shielding directly caused the increase in booster reusability."
        ),
        "unsupported_extra": "securing a $2B defense contract from NASA",
        "paraphrase": "In 2024, Orbital Dynamics Aerospace achieved a 22-ton payload capability to low-earth orbit."
    },
    {
        "entity": "Helios Grid Renewables",
        "alt_entity": "NextEra Solar",
        "metric": "utility-scale battery storage output",
        "val": "850 megawatts",
        "alt_val": "1,200 megawatts",
        "year": "2023",
        "alt_year": "2025",
        "action": "commissioned the desert grid interconnect",
        "region_pair": ("Rajasthan and Gujarat", "Rajasthan, Gujarat, and Maharashtra"),
        "cause_pair": (
            "Grid curtailment fell by 15% after lithium-iron-phosphate batteries were installed.",
            "Installing lithium-iron-phosphate batteries caused grid curtailment to fall by 15%."
        ),
        "unsupported_extra": "powering over 1.5 million residential homes",
        "paraphrase": "Helios Grid Renewables delivered 850 MW of utility battery storage in 2023."
    },
    {
        "entity": "LithoCore Semiconductors",
        "alt_entity": "TSMC Arizona",
        "metric": "3nm wafer yield rate",
        "val": "78%",
        "alt_val": "92%",
        "year": "2024",
        "alt_year": "2022",
        "action": "adopted High-NA EUV lithography",
        "region_pair": ("Taiwan and Japan", "Taiwan, Japan, and South Korea"),
        "cause_pair": (
            "Defect density decreased after cleanroom airflow was re-engineered.",
            "Re-engineering cleanroom airflow directly caused defect density to decrease."
        ),
        "unsupported_extra": "allowing smartphone chip prices to drop by 20%",
        "paraphrase": "During 2024, LithoCore Semiconductors reached a 78% yield rate on its 3nm wafer line."
    }
]


def expand_seed_into_9_categories(seed: Dict, split_name: str, start_idx: int) -> List[Dict]:
    """Generates all 9 blueprint perturbation categories from a single domain seed."""
    samples = []
    e = seed["entity"]
    alt_e = seed["alt_entity"]
    m = seed["metric"]
    v = seed["val"]
    alt_v = seed["alt_val"]
    y = seed["year"]
    alt_y = seed["alt_year"]
    act = seed["action"]
    reg_true, reg_partial = seed["region_pair"]
    cause_ev, cause_cl = seed["cause_pair"]
    extra = seed["unsupported_extra"]
    para = seed["paraphrase"]

    base_evidence = f"In {y}, {e} reported {m} of {v} and {act} across {reg_true}."

    # 1. Normal Entailment (Easy)
    samples.append({
        "id": f"{split_name}_{start_idx + 1:04d}",
        "evidence": base_evidence,
        "claim": f"{e} reported {m} of {v} in {y}.",
        "label": "entailment",
        "source": "synthetic_perturbation",
        "category": "normal_entailment",
        "difficulty": "easy",
        "split": split_name
    })

    # 2. Paraphrase Entailment (Medium)
    samples.append({
        "id": f"{split_name}_{start_idx + 2:04d}",
        "evidence": base_evidence,
        "claim": para,
        "label": "entailment",
        "source": "synthetic_perturbation",
        "category": "paraphrase_entailment",
        "difficulty": "medium",
        "split": split_name
    })

    # 3. Numerical Swap Contradiction (Hard)
    samples.append({
        "id": f"{split_name}_{start_idx + 3:04d}",
        "evidence": base_evidence,
        "claim": f"In {y}, {e} reported {m} of {alt_v}.",
        "label": "contradiction",
        "source": "synthetic_perturbation",
        "category": "numerical_swap",
        "difficulty": "hard",
        "split": split_name
    })

    # 4. Date / Year Swap Contradiction (Hard)
    samples.append({
        "id": f"{split_name}_{start_idx + 4:04d}",
        "evidence": base_evidence,
        "claim": f"In {alt_y}, {e} reported {m} of {v}.",
        "label": "contradiction",
        "source": "synthetic_perturbation",
        "category": "date_swap",
        "difficulty": "hard",
        "split": split_name
    })

    # 5. Entity Swap Contradiction (Hard)
    samples.append({
        "id": f"{split_name}_{start_idx + 5:04d}",
        "evidence": base_evidence,
        "claim": f"In {y}, {alt_e} reported {m} of {v} and {act}.",
        "label": "contradiction",
        "source": "synthetic_perturbation",
        "category": "entity_swap",
        "difficulty": "hard",
        "split": split_name
    })

    # 6. Explicit Negation Contradiction (Medium)
    samples.append({
        "id": f"{split_name}_{start_idx + 6:04d}",
        "evidence": f"In {y}, {e} did not {act} due to regulatory review.",
        "claim": f"In {y}, {e} successfully {act}.",
        "label": "contradiction",
        "source": "synthetic_perturbation",
        "category": "negation",
        "difficulty": "medium",
        "split": split_name
    })

    # 7. Unsupported Addition -> Neutral (Hard)
    samples.append({
        "id": f"{split_name}_{start_idx + 7:04d}",
        "evidence": base_evidence,
        "claim": f"In {y}, {e} reported {m} of {v} {extra}.",
        "label": "neutral",
        "source": "synthetic_perturbation",
        "category": "unsupported_addition",
        "difficulty": "hard",
        "split": split_name
    })

    # 8. Causal Modification -> Neutral (Hard)
    samples.append({
        "id": f"{split_name}_{start_idx + 8:04d}",
        "evidence": cause_ev,
        "claim": cause_cl,
        "label": "neutral",
        "source": "synthetic_perturbation",
        "category": "causal_modification",
        "difficulty": "hard",
        "split": split_name
    })

    # 9. Partial Support / Scope Drift -> Neutral (Hard)
    samples.append({
        "id": f"{split_name}_{start_idx + 9:04d}",
        "evidence": base_evidence,
        "claim": f"In {y}, {e} {act} across {reg_partial}.",
        "label": "neutral",
        "source": "synthetic_perturbation",
        "category": "partial_support",
        "difficulty": "hard",
        "split": split_name
    })

    return samples


def generate_all_datasets():
    """Generates train, val, and test JSONL datasets with zero domain leakage."""
    processed_dir = DATASETS_DIR / "processed"
    eval_dir = DATASETS_DIR / "evaluation"
    processed_dir.mkdir(parents=True, exist_ok=True)
    eval_dir.mkdir(parents=True, exist_ok=True)

    # Generate Train (first 4 seeds, augmented with variations) & Val (5th seed)
    train_samples = []
    for idx, seed in enumerate(TRAIN_VAL_SEEDS[:4]):
        train_samples.extend(expand_seed_into_9_categories(seed, "train", len(train_samples)))

    val_samples = expand_seed_into_9_categories(TRAIN_VAL_SEEDS[4], "val", 0)

    # Generate Golden Test Set from completely disjoint domains
    test_samples = []
    for idx, seed in enumerate(TEST_BENCHMARK_SEEDS):
        test_samples.extend(expand_seed_into_9_categories(seed, "test", len(test_samples)))

    # Write JSONL files
    def write_jsonl(filepath: Path, data: List[Dict]):
        with open(filepath, "w", encoding="utf-8") as f:
            for item in data:
                f.write(json.dumps(item, ensure_ascii=False) + "\n")

    train_path = processed_dir / "train.jsonl"
    val_path = processed_dir / "val.jsonl"
    test_path = eval_dir / "test.jsonl"

    write_jsonl(train_path, train_samples)
    write_jsonl(val_path, val_samples)
    write_jsonl(test_path, test_samples)

    print(f"Dataset generation complete!")
    print(f"  -> Train samples : {len(train_samples)} saved to {train_path}")
    print(f"  -> Val samples   : {len(val_samples)} saved to {val_path}")
    print(f"  -> Test samples  : {len(test_samples)} saved to {test_path}")


if __name__ == "__main__":
    generate_all_datasets()