/**
 * GroundGuard Phase 7: Deterministic Technical Checks
 * Stage 2 of the Dual-Stage Grounding Verification pipeline.
 *
 * Implements transparent, deterministic consistency checks for industrial
 * specifications where generic NLI models may suffer from fuzziness:
 * - Numbers (quantities, decimals, signs)
 * - Units (incompatible engineering units without explicit conversion)
 * - Equipment / P&ID Identifiers (P-101A vs P-101B, V-204 vs V-240)
 * - Dates (exact calendar dates)
 * - Percentages (exact percentage values)
 * - Negation polarity (connected vs disconnected / not connected)
 * - Modality escalation (should/may escalated to must/shall)
 * - Directional relations (upstream vs downstream)
 */

export interface TechnicalCheckConflict {
  type:
    | 'number_mismatch'
    | 'sign_mismatch'
    | 'unit_mismatch'
    | 'identifier_mismatch'
    | 'date_mismatch'
    | 'percentage_mismatch'
    | 'negation_mismatch'
    | 'modality_escalation'
    | 'relation_direction_mismatch';
  details: string;
}

export interface TechnicalCheckResult {
  passed: boolean;
  conflicts: TechnicalCheckConflict[];
}

export class TechnicalChecker {
  /**
   * Evaluates deterministic consistency between claim text and supporting evidence text.
   */
  public evaluate(claimText: string, evidenceText: string): TechnicalCheckResult {
    const conflicts: TechnicalCheckConflict[] = [];

    const normClaim = this.normalize(claimText);
    const normEv = this.normalize(evidenceText);

    // 1. Identifier consistency
    const idConflict = this.checkIdentifiers(normClaim, normEv);
    if (idConflict) conflicts.push(idConflict);

    // 2. Numeric and sign consistency
    const numConflicts = this.checkNumbers(normClaim, normEv);
    conflicts.push(...numConflicts);

    // 3. Percentage consistency
    const pctConflict = this.checkPercentages(normClaim, normEv);
    if (pctConflict) conflicts.push(pctConflict);

    // 4. Date consistency
    const dateConflict = this.checkDates(normClaim, normEv);
    if (dateConflict) conflicts.push(dateConflict);

    // 5. Unit consistency
    const unitConflict = this.checkUnits(normClaim, normEv);
    if (unitConflict) conflicts.push(unitConflict);

    // 6. Negation polarity
    const negConflict = this.checkNegation(normClaim, normEv);
    if (negConflict) conflicts.push(negConflict);

    // 7. Modality escalation
    const modConflict = this.checkModality(normClaim, normEv);
    if (modConflict) conflicts.push(modConflict);

    // 8. Directional relations
    const relConflict = this.checkRelationDirection(normClaim, normEv);
    if (relConflict) conflicts.push(relConflict);

    return {
      passed: conflicts.length === 0,
      conflicts,
    };
  }

  private normalize(text: string): string {
    return text
      .normalize('NFKC')
      .replace(/\s+/g, ' ')
      .replace(/m3\/h|m\^3\/h/g, 'm³/h')
      .replace(/ºC|º C|deg C/g, '°C')
      .trim();
  }

  private checkIdentifiers(claim: string, evidence: string): TechnicalCheckConflict | null {
    const tagPattern = /\b([A-Z]{1,4}-\d{2,4}[A-Z]?)\b/g;
    const claimTags = Array.from(new Set(claim.match(tagPattern) || []));
    const evTags = Array.from(new Set(evidence.match(tagPattern) || []));

    if (claimTags.length === 0 || evTags.length === 0) return null;

    // Check if any tag asserted in claim is completely absent from evidence that has tags
    for (const tag of claimTags) {
      if (!evTags.includes(tag)) {
        return {
          type: 'identifier_mismatch',
          details: `Claim references identifier '${tag}' but evidence contains only [${evTags.join(', ')}]`,
        };
      }
    }
    return null;
  }

  private checkNumbers(claim: string, evidence: string): TechnicalCheckConflict[] {
    const conflicts: TechnicalCheckConflict[] = [];

    // Check signed temperatures e.g. -20°C vs 20°C or -20 C vs 20 C
    const tempPattern = /([+-]?\d+(?:\.\d+)?)\s*(?:°C|C\b)/gi;
    const claimTemps = Array.from(claim.matchAll(tempPattern)).map((m) => parseFloat(m[1]));
    const evTemps = Array.from(evidence.matchAll(tempPattern)).map((m) => parseFloat(m[1]));

    if (claimTemps.length > 0 && evTemps.length > 0) {
      for (const ct of claimTemps) {
        // Look for sign flip: e.g. ct = 20 while ev contains -20 or vice versa
        if (evTemps.includes(-ct) && !evTemps.includes(ct)) {
          conflicts.push({
            type: 'sign_mismatch',
            details: `Temperature sign mismatch: claim has ${ct}°C while evidence specifies ${-ct}°C`,
          });
        } else if (!evTemps.includes(ct)) {
          conflicts.push({
            type: 'number_mismatch',
            details: `Temperature quantity mismatch: claim specifies ${ct}°C, evidence has [${evTemps.join(', ')}]°C`,
          });
        }
      }
    }

    // Check pressure / flow / generic unit-attached numbers: e.g. (\d+(\.\d+)?)\s*(bar|m³/h|m3/h|psi|rpm)
    const unitQtyPattern = /\b(\d+(?:\.\d+)?)\s*(bar|m³\/h|psi|rpm|kpa|mpa)\b/gi;
    const parseUnitMap = (txt: string) => {
      const map = new Map<string, number[]>();
      for (const m of txt.matchAll(unitQtyPattern)) {
        const val = parseFloat(m[1]);
        const unit = m[2].toLowerCase();
        if (!map.has(unit)) map.set(unit, []);
        map.get(unit)!.push(val);
      }
      return map;
    };

    const claimUnits = parseUnitMap(claim);
    const evUnits = parseUnitMap(evidence);

    for (const [unit, cVals] of claimUnits.entries()) {
      if (evUnits.has(unit)) {
        const eVals = evUnits.get(unit)!;
        for (const cv of cVals) {
          if (!eVals.includes(cv)) {
            conflicts.push({
              type: 'number_mismatch',
              details: `Numeric mismatch for unit '${unit}': claim asserts ${cv} ${unit}, evidence has [${eVals.join(', ')}] ${unit}`,
            });
          }
        }
      }
    }

    // Unit mismatch: same numeric value associated with conflicting engineering units
    for (const [cUnit, cVals] of claimUnits.entries()) {
      for (const [eUnit, eVals] of evUnits.entries()) {
        if (cUnit !== eUnit) {
          for (const cv of cVals) {
            if (eVals.includes(cv)) {
              conflicts.push({
                type: 'unit_mismatch',
                details: `Unit mismatch: quantity ${cv} is specified in '${cUnit}' in claim, but in '${eUnit}' in evidence`,
              });
            }
          }
        }
      }
    }

    return conflicts;
  }

  private checkPercentages(claim: string, evidence: string): TechnicalCheckConflict | null {
    const pctPattern = /\b(\d+(?:\.\d+)?)\s*%/g;
    const cPcts = Array.from(claim.matchAll(pctPattern)).map((m) => parseFloat(m[1]));
    const ePcts = Array.from(evidence.matchAll(pctPattern)).map((m) => parseFloat(m[1]));

    if (cPcts.length > 0 && ePcts.length > 0) {
      for (const cp of cPcts) {
        if (!ePcts.includes(cp)) {
          return {
            type: 'percentage_mismatch',
            details: `Percentage mismatch: claim asserts ${cp}%, evidence specifies [${ePcts.join(', ')}]%`,
          };
        }
      }
    }
    return null;
  }

  private checkDates(claim: string, evidence: string): TechnicalCheckConflict | null {
    // Matches YYYY-MM-DD
    const isoDatePattern = /\b(\d{4}-\d{2}-\d{2})\b/g;
    const cDates = Array.from(claim.match(isoDatePattern) || []);
    const eDates = Array.from(evidence.match(isoDatePattern) || []);

    if (cDates.length > 0 && eDates.length > 0) {
      for (const cd of cDates) {
        if (!eDates.includes(cd)) {
          return {
            type: 'date_mismatch',
            details: `Date mismatch: claim asserts date ${cd}, evidence specifies [${eDates.join(', ')}]`,
          };
        }
      }
    }

    // Matches 4-digit years in context (e.g. in 2019 vs in 2024)
    const yearPattern = /\b(19\d\d|20\d\d)\b/g;
    const cYears = Array.from(claim.match(yearPattern) || []);
    const eYears = Array.from(evidence.match(yearPattern) || []);
    if (cYears.length > 0 && eYears.length > 0) {
      for (const cy of cYears) {
        if (!eYears.includes(cy)) {
          return {
            type: 'date_mismatch',
            details: `Year mismatch: claim asserts year ${cy}, evidence contains [${eYears.join(', ')}]`,
          };
        }
      }
    }

    return null;
  }

  private checkUnits(claim: string, evidence: string): TechnicalCheckConflict | null {
    // Detect similar number with different engineering units (e.g. 15 bar vs 15 MPa)
    const qtyPattern = /\b(\d+(?:\.\d+)?)\s*([a-zA-Z°³\/]+)\b/g;
    const cItems = Array.from(claim.matchAll(qtyPattern)).map((m) => ({ val: m[1], unit: m[2].toLowerCase() }));
    const eItems = Array.from(evidence.matchAll(qtyPattern)).map((m) => ({ val: m[1], unit: m[2].toLowerCase() }));

    const pressureUnits = new Set(['bar', 'mpa', 'kpa', 'psi']);
    const flowUnits = new Set(['m³/h', 'm3/h', 'l/s', 'gpm']);

    for (const c of cItems) {
      for (const e of eItems) {
        if (c.val === e.val && c.unit !== e.unit) {
          const bothPressure = pressureUnits.has(c.unit) && pressureUnits.has(e.unit);
          const bothFlow = flowUnits.has(c.unit) && flowUnits.has(e.unit);
          if (bothPressure || bothFlow) {
            return {
              type: 'unit_mismatch',
              details: `Unit mismatch for value ${c.val}: claim uses '${c.unit}', evidence specifies '${e.unit}' without converter`,
            };
          }
        }
      }
    }
    return null;
  }

  private checkNegation(claim: string, evidence: string): TechnicalCheckConflict | null {
    const normC = claim.toLowerCase();
    const normE = evidence.toLowerCase();

    // Check explicit connection negation
    const cNegConnected = normC.includes('not connected') || normC.includes('disconnected');
    const eConnected = normE.includes('connected to') && !normE.includes('not connected') && !normE.includes('disconnected');
    const cConnected = normC.includes('connected to') && !cNegConnected;
    const eNegConnected = normE.includes('not connected') || normE.includes('disconnected');

    if ((cNegConnected && eConnected) || (cConnected && eNegConnected)) {
      return {
        type: 'negation_mismatch',
        details: `Connection polarity conflict between claim and evidence`,
      };
    }

    // General negation polarity check: opposing truth values on the SAME predicate.
    // Compared sentence-locally: the evidence sentence that best matches the claim (by whole content words)
    // must carry the opposite polarity. Previously any "not" anywhere in the joined evidence plus 3 common
    // substrings ("the", "are", ...) produced a false contradiction.
    const NEG = /\b(not|never|no longer|cannot|can't|isn't|doesn't|don't|won't|wasn't|aren't)\b/i;
    const cHasNot = NEG.test(normC);
    const cContent = this.contentWords(normC);
    if (cContent.length === 0) return null;

    let best: { overlap: string[]; negated: boolean } | null = null;
    for (const sentence of normE.split(/(?<=[.!?;])\s+|\n+/)) {
      if (!sentence.trim()) continue;
      const sWords = new Set(this.contentWords(sentence));
      const overlap = cContent.filter((w) => sWords.has(w));
      if (!best || overlap.length > best.overlap.length) {
        best = { overlap, negated: NEG.test(sentence) };
      }
    }
    if (
      best &&
      best.negated !== cHasNot &&
      best.overlap.length >= Math.min(3, cContent.length) &&
      best.overlap.length / cContent.length >= 0.5
    ) {
      return {
        type: 'negation_mismatch',
        details: `Negation polarity conflict: claim and evidence assert opposing truth values on shared predicate [${best.overlap.join(', ')}]`,
      };
    }

    return null;
  }

  private static readonly STOPWORDS = new Set([
    'the', 'and', 'are', 'was', 'were', 'has', 'have', 'had', 'for', 'with', 'that', 'this', 'from', 'into', 'its',
    'his', 'her', 'their', 'our', 'your', 'which', 'who', 'whom', 'whose', 'been', 'being', 'also', 'than', 'then',
    'there', 'here', 'they', 'them', 'she', 'him', 'you', 'all', 'any', 'can', 'did', 'does', 'not', 'never', 'longer',
    'cannot', 'isn', 'doesn', 'don', 'won', 'wasn', 'aren', 'will', 'would', 'should', 'could', 'may', 'might', 'shall',
    'must', 'such', 'these', 'those', 'what', 'when', 'where', 'how', 'why', 'per', 'via', 'out', 'over', 'under',
  ]);

  /** Whole-word content tokens with light stemming (requires/required/requiring -> requir). */
  private contentWords(text: string): string[] {
    return (text.toLowerCase().match(/[a-z0-9][a-z0-9\-]*/g) || [])
      .filter((w) => w.length > 2 && !TechnicalChecker.STOPWORDS.has(w))
      .map((w) => w.replace(/(?:ing|ed|es|s)$/, '').replace(/e$/, ''))
      .filter((w) => w.length > 2);
  }

  private checkModality(claim: string, evidence: string): TechnicalCheckConflict | null {
    const normC = claim.toLowerCase();
    const normE = evidence.toLowerCase();

    const strictModals = ['must', 'shall', 'mandatory', 'required to'];
    const weakModals = ['should', 'may', 'recommended', 'optional', 'not required'];

    const claimHasStrict = strictModals.some((m) => normC.includes(m));
    const evHasWeak = weakModals.some((m) => normE.includes(m));
    const evHasStrict = strictModals.some((m) => normE.includes(m));

    if (claimHasStrict && evHasWeak && !evHasStrict) {
      return {
        type: 'modality_escalation',
        details: `Modality escalation: claim strengthens requirement to strict modal (must/shall) when evidence only states advisory/permissive modality (should/may)`,
      };
    }

    return null;
  }

  private checkRelationDirection(claim: string, evidence: string): TechnicalCheckConflict | null {
    const normC = claim.toLowerCase();
    const normE = evidence.toLowerCase();

    // Upstream / downstream direction check between two entities A and B
    // e.g. "V-204 is upstream of P-101A" vs "P-101A is upstream of V-204"
    const dirPattern = /\b([a-z0-9-]+)\s+(?:is\s+)?(upstream|downstream)\s+of\s+([a-z0-9-]+)\b/gi;
    const cMatches = Array.from(normC.matchAll(dirPattern));
    const eMatches = Array.from(normE.matchAll(dirPattern));

    for (const cm of cMatches) {
      const cSub = cm[1];
      const cRel = cm[2];
      const cObj = cm[3];

      for (const em of eMatches) {
        const eSub = em[1];
        const eRel = em[2];
        const eObj = em[3];

        // Case 1: Reversed subjects with same relation word
        if (cSub === eObj && cObj === eSub && cRel === eRel) {
          return {
            type: 'relation_direction_mismatch',
            details: `Inverted directional relation: claim states '${cSub} is ${cRel} of ${cObj}', evidence specifies '${eSub} is ${eRel} of ${eObj}'`,
          };
        }
        // Case 2: Same subjects with inverted relation word
        if (cSub === eSub && cObj === eObj && cRel !== eRel) {
          return {
            type: 'relation_direction_mismatch',
            details: `Conflicting relation direction: claim states '${cSub} is ${cRel} of ${cObj}', evidence specifies '${eSub} is ${eRel} of ${eObj}'`,
          };
        }
      }
    }

    return null;
  }
}

export const technicalChecker = new TechnicalChecker();
