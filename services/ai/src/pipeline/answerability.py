"""
GroundGuard answerability & generation-outcome utilities (Stabilization Phase 02).

Separates three questions that were previously conflated into one reranker score:
  1. Relevance     -- is the retrieved evidence about the question's topic?        (calibrate_relevance)
  2. Answerability -- does the evidence actually state the requested attribute?   (assess_requested_attribute)
  3. Outcome       -- did the generator answer, partially answer, or abstain?     (parse_generation_outcome)
"""

import math
import re
from dataclasses import dataclass, field
from typing import Iterable, List, Optional, Tuple

# ---------------------------------------------------------------------------
# 1. Relevance calibration
# ---------------------------------------------------------------------------
# The FlashRank TinyBERT-L-2 cross-encoder scores narrative passages near zero even when they answer
# the question (median 0.0000 on labeled stud.pdf positives; AUC 0.62), while it is reliable on short
# specification passages. Query/passage dense cosine (all-MiniLM-L6-v2) separated on-topic from
# off-topic queries at the query level on the labeled calibration set (positives max-cos 0.34-0.81,
# off-topic max-cos <= 0.21). The calibrated relevance takes the stronger of the two signals, with the
# cosine mapped so the 0.35 sufficiency threshold sits at the midpoint of that observed gap (cos ~0.277).
COSINE_CALIBRATION_SLOPE = 15.0
COSINE_CALIBRATION_CENTER = 0.318


def cosine_to_relevance(cosine: Optional[float]) -> float:
    if cosine is None:
        return 0.0
    return 1.0 / (1.0 + math.exp(-COSINE_CALIBRATION_SLOPE * (float(cosine) - COSINE_CALIBRATION_CENTER)))


def calibrate_relevance(cross_encoder_score: Optional[float], cosine: Optional[float]) -> float:
    """Calibrated topical relevance in [0, 1]. Relevance only -- never evidence of answerability."""
    ce = float(cross_encoder_score or 0.0)
    return round(max(ce, cosine_to_relevance(cosine)), 6)


# ---------------------------------------------------------------------------
# 2. Requested-attribute answerability
# ---------------------------------------------------------------------------
# (attribute, query pattern, evidence pattern). Applied only to value-lookup questions that name a
# measurable/specifiable attribute; narrative or explanatory questions are left to the generator.
_RANGE = r"\d+(?:\.\d+)?\s*(?:°\s*[cf]|[a-z%]+)?\s*(?:to|-|–|~)\s*[+-]?\d"
ATTRIBUTE_HEADS: List[Tuple[str, str, str]] = [
    ("temperature", r"\btemperatures?\b|\btemp\b|\bhow (?:hot|cold|warm)\b",
     r"temperature|\btemp\b|°\s?[cf]\b|degrees?\s+(?:celsius|fahrenheit|c\b|f\b)|celsius|fahrenheit|\b\d+\s?°?c\b"),
    ("pressure", r"\bpressures?\b|\bpsig?\b", r"pressure|\bpsig?\b|\bbar\b|\bkpa\b|\bmpa\b"),
    ("flow rate", r"\bflow(?:\s*rate)?\b|\bthroughput\b|\bgpm\b",
     r"\bflow|\bgpm\b|m3/h|m³/h|l/min|lit(?:er|re)s? per (?:minute|hour)"),
    ("voltage", r"\bvoltages?\b|\bvolts?\b", r"voltage|\bvolts?\b|\d\s?v\b|\bv\s?(?:dc|ac)\b|\bvdc\b|\bvac\b"),
    ("current", r"\bcurrent (?:draw|rating|consumption)\b|\bamps?\b|\bamperage\b|\bwhat current\b",
     r"\bcurrent\b|\bamps?\b|\bamperes?\b|\d\s?m?a\b"),
    ("power rating", r"\bpower (?:rating|consumption|output|draw)\b|\bwattage\b|\bhorsepower\b",
     r"\bpower\b|\bwatts?\b|\bkw\b|\bhp\b|horsepower"),
    ("speed", r"\b(?:rotational )?speed\b|\brpm\b|\bhow fast\b", r"\bspeed\b|\brpm\b"),
    ("frequency", r"\bfrequency\b|\bhz\b", r"frequency|\bhz\b"),
    ("torque", r"\btorque\b", r"torque|\bn\s?·?m\b"),
    ("accuracy", r"\baccura(?:cy|te|tely)\b|\bprecision\b|\btolerance\b",
     r"accura|precision|tolerance|±|\+-|\+/-"),
    ("material", r"\bmaterials?\b|\bmade (?:of|from)\b|\bconstructed (?:of|from)\b",
     r"material|made (?:of|from)|stainless|steel|alloy|cast iron|bronze|plastic|polymer|alumini?um|titanium"),
    ("weight", r"\bweigh(?:t|s)?\b|\bmass\b", r"weigh|\bmass\b|\bkg\b|\blbs?\b"),
    ("dimensions", r"\bdimensions?\b|\bdiameter\b|\bhow (?:big|large|wide|tall)\b",
     r"dimension|diameter|length|width|height|\bmm\b|\bcm\b|\binch"),
    ("NPSH", r"\bnpsh", r"npsh"),
    ("efficiency", r"\befficiency\b", r"efficien"),
    ("baud rate", r"\bbaud\b", r"baud"),
    ("sampling rate", r"\bsampl(?:ing|e)\s+(?:rate|interval|period|frequency)\b",
     r"sampl|reading interval|once every|per second"),
    ("service interval", r"\b(?:maintenance|service|inspection|replacement|calibration|lubrication)\s+"
                         r"(?:interval|schedule|frequency|period)\b",
     r"interval|schedule|every \w+|\bmonths?\b|\bhours\b|annual|weekly|daily|yearly"),
    ("capacity", r"\bcapacity\b", r"capacity|\blit(?:er|re)s?\b|\bgallons?\b|\bm3\b"),
    ("humidity", r"\bhumidity\b", r"humidity|\brh\b"),
    ("service life", r"\blifespan\b|\blife ?time\b|\bmtbf\b|\bservice life\b", r"lifespan|life ?time|mtbf|service life"),
    ("warranty", r"\bwarranty\b", r"warranty"),
    ("IP rating", r"\bip ?rating\b|\bingress protection\b|\bip\s?\d\d\b", r"\bip\s?\d\d|ingress protection"),
    ("manufacturer", r"\bmanufacturer\b|\bmanufactured by\b|\bwho (?:makes|manufactures)\b|\bvendor\b",
     r"manufactur|made by|vendor|supplier"),
]

# Qualifiers that change WHICH value is meant (design vs operating temperature, max vs nominal...).
# (label, query pattern, evidence pattern). A requested qualifier must be stated alongside the attribute.
ATTRIBUTE_QUALIFIERS: List[Tuple[str, str, str]] = [
    ("design", r"\bdesign\b", r"\bdesign\b"),
    ("maximum", r"\bmax(?:imum)?\b|\bhighest\b|\bpeak\b|\bupper limit\b|\bwithstand\b|\bat most\b",
     rf"\bmax(?:imum)?\b|\bhighest\b|\bpeak\b|\bupper\b|\bup to\b|\blimit\b|{_RANGE}"),
    ("minimum", r"\bmin(?:imum)?\b|\blowest\b|\bat least\b", rf"\bmin(?:imum)?\b|\blowest\b|\bat least\b|{_RANGE}"),
    ("test", r"\btest\b|\bhydrostatic\b", r"\btest|hydrostatic"),
    ("burst", r"\bburst\b", r"\bburst"),
    ("relief/set point", r"\brelief\b|\bset ?point\b", r"relief|set ?point"),
    ("ambient", r"\bambient\b", r"ambient"),
    ("suction", r"\bsuction\b|\binlet\b", r"suction|inlet"),
    ("discharge", r"\bdischarge\b|\boutlet\b", r"discharge|outlet"),
    ("standby", r"\bstandby\b|\bidle\b", r"standby|idle"),
    ("inrush/start-up", r"\binrush\b|\bstart-?up\b|\bstarting\b", r"inrush|start-?up|starting"),
    ("normal/operating", r"\bnormal(?:ly)?\b|\boperating\b|\btypical(?:ly)?\b|\bnominal\b",
     r"normal|operat(?:e|es|ing|ion)\b|typical|nominal|rated|\bruns? at\b"),
    ("supply", r"\bsupply\b|\binput\b", r"supply|input|operating|powered"),
]

_EXPLANATORY = re.compile(r"\b(?:why|explain|describe|summari[sz]e|overview|compare|comparison|difference|how does|how do|how is|how are)\b", re.I)
_VALUE_LOOKUP = re.compile(r"^\s*(?:what|which|how\s+(?:hot|cold|warm|much|many|fast|accurate(?:ly)?|high|heavy|big|large|wide|often)|is|are|does|do|at what|tell me|give me|list)\b", re.I)


@dataclass
class AttributeAssessment:
    applicable: bool
    attribute: Optional[str] = None
    qualifiers: List[str] = field(default_factory=list)
    covered: Optional[bool] = None
    covering_chunk_ids: List[str] = field(default_factory=list)
    reason: Optional[str] = None

    @property
    def label(self) -> Optional[str]:
        if not self.attribute:
            return None
        return " ".join(self.qualifiers + [self.attribute])


def assess_requested_attribute(query: Optional[str], candidates: Iterable) -> AttributeAssessment:
    """
    Deterministic answerability check for value-lookup questions: the requested attribute (and any
    value-selecting qualifier such as 'design' or 'maximum') must be stated in at least one retrieved
    chunk. An equipment tag or document match alone never establishes that the fact is present.
    """
    q = (query or "").strip()
    if not q or _EXPLANATORY.search(q) or not _VALUE_LOOKUP.search(q):
        return AttributeAssessment(applicable=False)
    ql = q.lower()
    head = next(((name, ev) for name, qp, ev in ATTRIBUTE_HEADS if re.search(qp, ql)), None)
    if head is None:
        return AttributeAssessment(applicable=False)
    attr_name, attr_ev = head
    quals = [(label, ev) for label, qp, ev in ATTRIBUTE_QUALIFIERS if re.search(qp, ql)]

    covering, head_only = [], []
    for c in candidates:
        text = (getattr(c, "text", None) or (c.get("text") if isinstance(c, dict) else "") or "").lower()
        if not re.search(attr_ev, text):
            continue
        cid = getattr(c, "chunkId", None) or (c.get("chunkId") if isinstance(c, dict) else None)
        head_only.append(cid)
        # Qualifiers must be bound to the attribute: stated in the same sentence, not elsewhere in the chunk.
        sentences = re.split(r"(?<=[.!?;])\s+|\n+", text)
        if any(re.search(attr_ev, s) and all(re.search(ev, s) for _, ev in quals) for s in sentences):
            covering.append(cid)

    res = AttributeAssessment(applicable=True, attribute=attr_name, qualifiers=[l for l, _ in quals],
                              covered=bool(covering), covering_chunk_ids=[c for c in covering if c])
    if not covering:
        if head_only and quals:
            res.reason = (f"Retrieved evidence mentions {attr_name} but does not state the requested "
                          f"{'/'.join(res.qualifiers)} {attr_name}")
        else:
            res.reason = f"Requested attribute '{res.label}' is not stated in the retrieved evidence"
    return res


# ---------------------------------------------------------------------------
# 3. Generation outcome (structured tag + sentence-level fallback)
# ---------------------------------------------------------------------------
OUTCOME_ANSWERED = "ANSWERED"
OUTCOME_PARTIAL = "PARTIAL"
OUTCOME_INSUFFICIENT = "INSUFFICIENT"
OUTCOME_TAG_RE = re.compile(r"\s*<<\s*OUTCOME\s*:\s*(ANSWERED|PARTIAL|INSUFFICIENT)\s*>>\s*", re.I)
OUTCOME_TAG_MAX_LEN = len("<<OUTCOME:INSUFFICIENT>>") + 6

_ABSENCE_SENTENCE = re.compile(
    r"\b(?:does(?:\s+not|n['’]t)|do(?:\s+not|n['’]t)|did(?:\s+not|n['’]t))\s+"
    r"(?:explicitly\s+|directly\s+|clearly\s+)?"
    r"(?:specify|state|mention|contain|provide|include|describe|detail|explain|establish|indicate|say|cover|list|identify|give|discuss|address|document|define|report)\b"
    r"|\bno (?:information|mention|details?|data|evidence|record|indication)\b"
    r"|\bnot (?:specified|mentioned|stated|provided|available|described|documented|included|found|covered|given|listed)\b"
    r"|\b(?:insufficient|not enough|lacks?|lacking) (?:evidence|information|details?)\b"
    r"|\bcannot be (?:determined|confirmed|found|answered)\b|\bunable to (?:find|determine|answer|confirm)\b",
    re.I,
)
_CITATION_RE = re.compile(r"\s*\[[^\[\]]{1,160}\]")


def split_sentences(text: str) -> List[str]:
    t = _CITATION_RE.sub("", text or "")
    parts = re.split(r"(?<=[.!?])\s+(?=[A-Z\"'(*\-•\d])|\n+", t)
    return [p.strip(" *-•\t") for p in parts if p and p.strip(" *-•\t")]


def is_absence_statement(sentence: str) -> bool:
    return bool(_ABSENCE_SENTENCE.search(sentence or ""))


def classify_answer_text(text: str) -> str:
    """Fallback outcome when the generator emitted no outcome tag: sentence-level, not substring-anywhere."""
    sents = [s for s in split_sentences(text) if len(s) > 2]
    if not sents:
        return OUTCOME_INSUFFICIENT
    absent = [s for s in sents if is_absence_statement(s)]
    if len(absent) == len(sents):
        return OUTCOME_INSUFFICIENT
    if absent:
        return OUTCOME_PARTIAL
    return OUTCOME_ANSWERED


def parse_generation_outcome(raw_answer: str) -> Tuple[str, str, str]:
    """
    Returns (answer_without_tag, outcome, source) where source is "tag" when the generator declared the
    outcome explicitly, or "fallback" when it was inferred from sentence structure.
    """
    raw = raw_answer or ""
    tags = OUTCOME_TAG_RE.findall(raw)
    clean = OUTCOME_TAG_RE.sub(" ", raw).strip()
    clean = re.sub(r"[ \t]+\n", "\n", clean)
    if tags:
        outcome = tags[-1].upper()
        # A declared ANSWERED that consists only of absence statements is still an abstention.
        if outcome == OUTCOME_ANSWERED and classify_answer_text(clean) == OUTCOME_INSUFFICIENT:
            return clean, OUTCOME_INSUFFICIENT, "tag+text"
        return clean, outcome, "tag"
    return clean, classify_answer_text(clean), "fallback"


def strip_citations(text: str) -> str:
    return re.sub(r"\s+([.,;:])", r"\1", _CITATION_RE.sub("", text or "")).strip()


class OutcomeTagStreamFilter:
    """Holds back a short tail of streamed text so the trailing outcome tag is never shown to users."""

    def __init__(self, holdback: int = OUTCOME_TAG_MAX_LEN):
        self.buf = ""
        self.holdback = holdback

    def feed(self, chunk: str) -> str:
        self.buf += chunk or ""
        if len(self.buf) <= self.holdback:
            return ""
        emit, self.buf = self.buf[:-self.holdback], self.buf[-self.holdback:]
        # Never split inside a tag that has already started.
        cut = emit.rfind("<<")
        if cut != -1 and ">>" not in emit[cut:]:
            self.buf = emit[cut:] + self.buf
            emit = emit[:cut]
        return OUTCOME_TAG_RE.sub(" ", emit) if "<<" in emit else emit

    def flush(self) -> str:
        out, self.buf = OUTCOME_TAG_RE.sub("", self.buf), ""
        return out.rstrip()
