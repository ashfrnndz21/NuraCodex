import { getHealthMarkerRangeGuide } from '../../src/services/healthMarkers.mjs';

function findSource(sources, reference) {
  return (Array.isArray(sources) ? sources : []).find((source) => source.reference === reference);
}

function currentRecords(sources, matcher) {
  return (Array.isArray(sources) ? sources : []).filter((source) => source.kind === 'user_record'
    && source.status !== 'earlier_saved_version' && matcher.test(source.title));
}

function parseValueAndUnit(source) {
  const detail = String(source?.detail ?? '');
  const match = /^\s*(\d+(?:[.,]\d+)?)\s*([^\s.]*)/i.exec(detail);
  if (!match) return null;
  const value = Number(match[1].replace(',', '.'));
  if (!Number.isFinite(value)) return null;
  return { value, label: match[1].replace(',', '.'), unit: match[2].toLowerCase() };
}

function measurementValue(source) {
  return /^\s*(\d+(?:[.,]\d+)?\s*(?:kg|lb|cm|m|in|inch|inches))\b/i.exec(String(source?.detail ?? ''))?.[1]?.trim() ?? '';
}

function adultCategory(bmi) {
  if (bmi < 18.5) return 'below the adult healthy-weight screening range';
  if (bmi < 25) return 'in the adult healthy-weight screening range';
  if (bmi < 30) return 'in the adult overweight screening range';
  return 'in the adult obesity screening range';
}

function distinctValues(records) {
  return [...new Set(records.map((source) => String(source.detail ?? '').split(/[·.]\s/)[0].trim()).filter(Boolean))];
}

function lipidMarkerSummary(sources, definition, age) {
  const records = currentRecords(sources, definition.matcher);
  if (!records.length) return null;

  const classifyRecord = (source) => {
    const parsed = parseValueAndUnit(source);
    if (!parsed) return {
      label: definition.label, needsUnitCheck: true, aboveGuide: false,
      text: 'Your ' + definition.label.toLowerCase() + ' entry needs its value and unit checked against the original report.',
      references: [source.reference], sourceDetail: source.detail,
    };

    const unit = parsed.unit === 'mg/dl' ? 'mg/dL' : parsed.unit === 'mmol/l' ? 'mmol/L' : parsed.unit;
    const value = parsed.label + (unit ? ' ' + unit : '');
    const implausiblePair = (definition.key === 'total-cholesterol' && parsed.unit === 'mg/dl' && parsed.value < 20)
      || (definition.key === 'triglycerides' && parsed.unit === 'mg/dl' && parsed.value < 10);
    if (implausiblePair || !['mg/dl', 'mmol/l'].includes(parsed.unit)) return {
      label: definition.label, value, needsUnitCheck: true, aboveGuide: false,
      text: definition.key === 'total-cholesterol' && parsed.unit === 'mg/dl' && parsed.value < 20
        ? 'Your ' + definition.label.toLowerCase() + ' is recorded as ' + value + ', an unusual value/unit pairing; check it against the original report before interpreting it.'
        : definition.label + (definition.key === 'triglycerides' ? ' are recorded as ' : ' is recorded as ') + value + '; check the original report because this value/unit pairing is unusual or unclear.',
      references: [source.reference], sourceDetail: source.detail,
    };

    if (age !== null && age < 20) return {
      label: definition.label, value, needsUnitCheck: false, aboveGuide: false,
      text: 'Your ' + definition.label.toLowerCase() + ' is ' + value + '; use the lab’s age-specific range rather than an adult guide.',
      references: [source.reference], sourceDetail: source.detail,
    };

    const guide = getHealthMarkerRangeGuide({
      label: definition.label, value, eventDate: source.date,
      ageAtMeasurement: age ?? undefined, allowAdultGuideWhenAgeUnknown: age === null,
    });
    if (!guide) return {
      label: definition.label, value, needsUnitCheck: true, aboveGuide: false,
      text: 'Your ' + definition.label.toLowerCase() + ' result (' + value + ') needs its range checked against the original report.',
      references: [source.reference], sourceDetail: source.detail,
    };

    const descriptions = {
      'total-cholesterol': { DESIRABLE: 'within the common adult guide', 'BORDERLINE HIGH': 'above a common adult guide', HIGH: 'high on a common adult guide' },
      ldl: { OPTIMAL: 'within the common adult optimal range', 'NEAR OPTIMAL': 'near the common adult guide', 'BORDERLINE HIGH': 'above a common adult guide', HIGH: 'high on a common adult guide', 'VERY HIGH': 'very high on a common adult guide' },
      triglycerides: { NORMAL: 'within the common adult guide', 'BORDERLINE HIGH': 'above a common adult guide', HIGH: 'high on a common adult guide', 'VERY HIGH': 'very high on a common adult guide' },
    };
    const description = descriptions[definition.key]?.[guide.status];
    if (!description) return {
      label: definition.label, value, status: guide.status, needsUnitCheck: false, aboveGuide: false,
      text: 'Your ' + definition.label.toLowerCase() + ' is ' + value + '; compare it with the range printed on the report.',
      references: [source.reference], sourceDetail: source.detail,
    };
    return {
      label: definition.label, value, status: guide.status, description,
      text: definition.label + ' (' + value + ') ' + (definition.key === 'triglycerides' ? 'are ' : 'is ') + description,
      needsUnitCheck: false,
      aboveGuide: ['BORDERLINE HIGH', 'HIGH', 'VERY HIGH'].includes(guide.status),
      highLdl: definition.key === 'ldl' && ['HIGH', 'VERY HIGH'].includes(guide.status),
      references: [source.reference], sourceDetail: source.detail,
    };
  };

  const findings = records.map(classifyRecord);
  const values = distinctValues(records);
  const needsUnitCheck = findings.some((finding) => finding.needsUnitCheck);
  return {
    label: definition.label,
    text: findings.map((finding) => finding.text).join('. ') + (values.length > 1 && !needsUnitCheck ? '. These entries differ; check their dates before reading them as a trend.' : ''),
    needsUnitCheck,
    aboveGuide: findings.some((finding) => finding.aboveGuide),
    highLdl: findings.some((finding) => finding.highLdl),
    references: findings.flatMap((finding) => finding.references),
    findings,
    valuesDiffer: values.length > 1,
  };
}

function lipidSummary(sources, age) {
  const definitions = [
    { key: 'total-cholesterol', label: 'Total cholesterol', matcher: /\btotal cholesterol\b/i },
    { key: 'ldl', label: 'LDL cholesterol', matcher: /\bldl(?: cholesterol)?\b/i },
    { key: 'triglycerides', label: 'Triglycerides', matcher: /\btriglycerides?\b/i },
  ];
  const markers = definitions.map((definition) => lipidMarkerSummary(sources, definition, age)).filter(Boolean);
  if (!markers.length) return null;
  const findings = markers.flatMap((marker) => marker.findings);
  return {
    text: markers.map((marker) => marker.text).join(' '),
    needsUnitCheck: markers.some((marker) => marker.needsUnitCheck),
    aboveGuide: markers.some((marker) => marker.aboveGuide),
    highLdl: markers.some((marker) => marker.highLdl),
    references: markers.flatMap((marker) => marker.references),
    findings,
    valuesDiffer: markers.some((marker) => marker.valuesDiffer),
  };
}

function findingPhrase(finding) {
  const label = finding.label === 'LDL cholesterol' ? 'LDL cholesterol' : finding.label.toLowerCase();
  const verb = finding.label === 'Triglycerides' ? 'are' : 'is';
  if (finding.status === 'HIGH' || finding.status === 'VERY HIGH') return label + ' is ' + finding.status.toLowerCase() + ' at ' + finding.value + ' on a common adult guide';
  if (finding.status === 'BORDERLINE HIGH') return label + ' is above a common adult guide at ' + finding.value;
  return finding.text.replace(/[.]$/, '');
}

function lipidNarrative(cholesterol) {
  if (!cholesterol) return '';
  const usable = cholesterol.findings.filter((finding) => !finding.needsUnitCheck && finding.value);
  const elevated = usable.filter((finding) => finding.aboveGuide);
  const uncertain = cholesterol.findings.filter((finding) => finding.needsUnitCheck);
  const total = elevated.find((finding) => finding.label === 'Total cholesterol');
  const ldl = elevated.find((finding) => finding.label === 'LDL cholesterol');
  let lead = '';
  if (total && ldl) {
    lead = 'Your cholesterol stands out: total cholesterol is ' + total.status.toLowerCase() + ' at ' + total.value + ' and LDL cholesterol is ' + ldl.status.toLowerCase() + ' at ' + ldl.value + ', compared with common adult guides';
  } else if (elevated.length) {
    lead = elevated.map(findingPhrase).join('; ');
    if (elevated.length === 1) lead = 'Your ' + lead;
  } else if (usable.length) {
    lead = usable.map((finding) => finding.text.replace(/[.]$/, '')).join('; ');
  } else {
    lead = '';
  }
  const triglycerides = usable.find((finding) => finding.label === 'Triglycerides' && !finding.aboveGuide);
  if (triglycerides && elevated.length) lead += '; triglycerides are within guide at ' + triglycerides.value;
  const sentences = lead ? [lead] : [];
  if (uncertain.length === 1) {
    const finding = uncertain[0];
    sentences.push('The ' + finding.label.toLowerCase() + ' entry (' + (finding.value ?? finding.sourceDetail ?? 'unit unclear') + ') has an unusual or unclear value/unit pairing; check the original report before interpreting it');
  } else if (uncertain.length > 1) {
    sentences.push('These entries have unusual or unclear value/unit pairings: ' + uncertain.map((finding) => finding.label.toLowerCase() + ' ' + (finding.value ?? finding.sourceDetail ?? 'unit unclear')).join('; ') + '. Check their units against the original reports before comparing them');
  }
  if (cholesterol.valuesDiffer && !uncertain.length) sentences.push('These saved entries differ; check their dates before reading them as a trend');
  return sentences.filter(Boolean).join('. ') + '.';
}

function a1cSummary(records, educationReference) {
  if (!records.length) return null;
  if (records.length > 1) {
    const values = distinctValues(records);
    const parsedEntries = records.map((source) => ({ source, parsed: parseValueAndUnit(source) }));
    const supportedEntries = parsedEntries.filter((entry) => ['%', 'mmol/mol'].includes(entry.parsed?.unit));
    const increasedRiskEntries = supportedEntries.filter(({ parsed }) => parsed.unit === '%'
      ? parsed.value >= 5.7 && parsed.value < 6.5
      : parsed.value >= 39 && parsed.value < 48);
    const diabetesThresholdEntries = supportedEntries.filter(({ parsed }) => parsed.unit === '%'
      ? parsed.value >= 6.5
      : parsed.value >= 48);
    const unusualLowEntries = parsedEntries.filter((entry) => entry.parsed?.unit === 'mmol/mol' && entry.parsed.value < 20);
    const otherUnitEntries = parsedEntries.filter((entry) => !['%', 'mmol/mol'].includes(entry.parsed?.unit));
    const formatA1cValue = (parsed) => parsed.unit === '%' ? `${parsed.label}%` : `${parsed.label} ${parsed.unit}`;
    const notes = [];
    if (increasedRiskEntries.length) {
      const riskValues = increasedRiskEntries.map((entry) => formatA1cValue(entry.parsed)).join(' and ');
      notes.push(`Your HbA1c result${increasedRiskEntries.length === 1 ? '' : 's'} of ${riskValues} ${increasedRiskEntries.length === 1 ? 'is' : 'are'} in the range commonly used to flag increased diabetes risk.`);
    }
    if (supportedEntries.length) notes.push('HbA1c reflects average blood sugar over about three months.');
    if (diabetesThresholdEntries.length) {
      const thresholdValues = diabetesThresholdEntries.map((entry) => formatA1cValue(entry.parsed)).join(' and ');
      notes.push(`HbA1c ${thresholdValues} ${diabetesThresholdEntries.length === 1 ? 'is' : 'are'} at or above a threshold used in diabetes testing and need clinician interpretation.`);
    }
    if (unusualLowEntries.length) {
      const lowValues = unusualLowEntries.map((entry) => `${entry.parsed.label} mmol/mol${entry.source.date ? ` (${entry.source.date})` : ''}`).join(' and ');
      notes.push(`The HbA1c history includes ${lowValues}; this value is unusually low for mmol/mol, so check the value and unit against the original report before interpreting it.`);
    }
    if (otherUnitEntries.length) {
      const otherValues = otherUnitEntries.map(({ source, parsed }) => {
        const value = parsed ? `${parsed.label}${parsed.unit ? ` ${parsed.unit}` : ''}` : String(source.detail ?? 'unit not recorded');
        return `${value}${source.date ? ` (${source.date})` : ''}`;
      });
      notes.push(`The HbA1c history also includes ${otherValues.join('; ')} with unclear units; check the original report before interpreting it.`);
    }
    const entriesByDate = new Map();
    for (const entry of parsedEntries) {
      if (!entry.source.date) continue;
      const onDate = entriesByDate.get(entry.source.date) ?? [];
      onDate.push(entry);
      entriesByDate.set(entry.source.date, onDate);
    }
    const sameDayEntries = [...entriesByDate.entries()].find(([, entries]) => entries.length > 1);
    if (sameDayEntries) {
      notes.push(`More than one HbA1c entry is dated ${sameDayEntries[0]}; check the original reports to confirm whether they are separate results or one corrected result. They remain grouped under one HbA1c marker until you confirm.`);
    } else if (values.length > 1) {
      notes.push('These readings stay grouped under one HbA1c marker; interpret each by its own date and report rather than combining them into one value.');
    }
    return {
      text: notes.join(' '),
      needsReview: increasedRiskEntries.length > 0 || diabetesThresholdEntries.length > 0,
      needsUnitCheck: otherUnitEntries.length > 0,
      needsValueCheck: unusualLowEntries.length > 0 || Boolean(sameDayEntries),
      references: records.map((source) => source.reference).concat(educationReference ? [educationReference] : []),
    };
  }

  const source = records[0];
  const parsed = parseValueAndUnit(source);
  if (!parsed) return {
    text: 'Your HbA1c entry needs its value and unit checked against the original report.',
    needsUnitCheck: true,
    references: [source.reference],
  };

  if (parsed.unit === '%' && parsed.value >= 5.7 && parsed.value < 6.5) {
    return {
      text: 'Your HbA1c is ' + parsed.label + '%, in the 5.7–6.4% range used to identify increased diabetes risk; it reflects average blood sugar over about three months.',
      needsReview: true,
      needsUnitCheck: false,
      references: [source.reference].concat(educationReference ? [educationReference] : []),
    };
  }
  if (parsed.unit === '%' && parsed.value >= 6.5) {
    return {
      text: 'Your HbA1c is ' + parsed.label + '%, at or above the 6.5% threshold used in diabetes testing; a clinician can interpret it with the full report and confirm the result.',
      needsReview: true,
      needsUnitCheck: false,
      references: [source.reference].concat(educationReference ? [educationReference] : []),
    };
  }
  if (parsed.unit === 'mmol/mol' && parsed.value < 20) {
    return {
      text: 'Your HbA1c is recorded as ' + parsed.label + ' mmol/mol, below the common adult screening cutoffs; check the value and unit on the original report before interpreting it.',
      needsReview: true,
      needsUnitCheck: false,
      needsValueCheck: true,
      references: [source.reference].concat(educationReference ? [educationReference] : []),
    };
  }
  if (parsed.unit === 'mmol/mol' && parsed.value >= 39 && parsed.value < 48) return {
    text: `Your HbA1c is ${parsed.label} mmol/mol, in the range commonly used to flag increased diabetes risk; it reflects average blood sugar over about three months.`,
    needsReview: true,
    needsUnitCheck: false,
    references: [source.reference].concat(educationReference ? [educationReference] : []),
  };
  if (parsed.unit === 'mmol/mol' && parsed.value >= 48) return {
    text: `Your HbA1c is ${parsed.label} mmol/mol, at or above a threshold used in diabetes testing; a clinician can interpret it with the full report and confirm the result.`,
    needsReview: true,
    needsUnitCheck: false,
    references: [source.reference].concat(educationReference ? [educationReference] : []),
  };
  if (parsed.unit === 'mmol/mol') return {
    text: `Your HbA1c is ${parsed.label} mmol/mol, below the common adult screening threshold of 39 mmol/mol.`,
    needsReview: false,
    needsUnitCheck: false,
    references: [source.reference].concat(educationReference ? [educationReference] : []),
  };
  return {
    text: 'Your HbA1c is ' + parsed.label + (parsed.unit ? ' ' + parsed.unit : '') + ' and reflects average blood sugar over about three months.',
    needsUnitCheck: false,
    references: [source.reference].concat(educationReference ? [educationReference] : []),
  };
}

function followUpSteps({ bmi, cholesterol, a1c, bloodPressure }) {
  const steps = [];
  if (cholesterol?.aboveGuide) {
    steps.push(cholesterol.highLdl ? 'What does my LDL result mean?' : 'What does this cholesterol result mean?');
    steps.push(cholesterol.needsUnitCheck ? 'How do I confirm the other cholesterol unit?' : 'What should I ask at a cholesterol review?');
  } else if (cholesterol?.needsUnitCheck) {
    steps.push('How do I confirm the cholesterol unit?');
    steps.push('What does a full lipid panel show?');
  }
  if (steps.length < 2 && a1c?.needsReview) {
    if (a1c.needsValueCheck) {
      steps.push('Check the HbA1c value and unit on its original report');
      if (steps.length < 2) steps.push('What does HbA1c measure over time?');
    } else if (a1c.needsUnitCheck) {
      steps.push('What does my HbA1c percentage mean?');
      if (steps.length < 2) steps.push('How do I confirm the other HbA1c units?');
    } else {
      if (!steps.length) steps.push('What does my HbA1c say about blood sugar?');
      if (steps.length < 2) steps.push('What does HbA1c measure over time?');
    }
  } else if ((a1c?.needsUnitCheck || a1c?.needsValueCheck) && !steps.length) {
    steps.push(a1c.needsValueCheck ? 'Check the HbA1c value and unit on its original report' : 'How do I confirm the HbA1c unit?');
    steps.push('What does HbA1c measure over time?');
  }
  if (steps.length < 2 && bloodPressure?.aboveGuide) {
    if (!steps.length) steps.push('How should I recheck my blood pressure?');
    if (steps.length < 2) steps.push('What do the top and bottom numbers mean?');
  } else if (!steps.length && bloodPressure?.systolicOnly) {
    steps.push('What does my systolic number mean?');
    steps.push('How do I complete this blood-pressure reading?');
  }
  if (!steps.length && bmi && cholesterol && !cholesterol.needsUnitCheck && !cholesterol.aboveGuide) {
    steps.push('How do BMI and cholesterol fit together?');
  } else if (!steps.length && bmi && a1c) {
    steps.push('How do BMI and HbA1c fit together?');
  }
  if (!steps.length && bmi) steps.push('What does BMI mean for my age?');
  if (!steps.length) steps.push('What measurements would complete this picture?');
  if (steps.length === 1) steps.push(cholesterol ? 'What does a full lipid panel show?' : 'What should I review next?');
  return [...new Set(steps)].slice(0, 2);
}

/** Compose a concise, source-linked interpretation from the records the user selected. */
export function applyProfileSummaryInsight(answer, measurements, sources) {
  const bmi = measurements?.find((item) => item.kind === 'calculated_bmi');
  const weight = bmi ? findSource(sources, bmi.weightReference) : null;
  const height = bmi ? findSource(sources, bmi.heightReference) : null;
  const age = Number.isInteger(bmi?.ageAtMeasurement) ? bmi.ageAtMeasurement : null;
  const weightValue = measurementValue(weight);
  const heightValue = measurementValue(height);
  const roundedValue = Number.parseFloat(String(bmi?.value ?? ''));
  const bmiValue = Number.isFinite(bmi?.rawValue) ? bmi.rawValue : roundedValue;
  const hasBmi = Boolean(weightValue && heightValue && Number.isFinite(bmiValue) && Number.isFinite(roundedValue));

  const cholesterolEducation = (Array.isArray(sources) ? sources : []).find((source) => source.kind === 'external_source' && /cholesterol levels/i.test(source.title));
  const cholesterol = lipidSummary(sources, age);
  if (cholesterol && cholesterolEducation) cholesterol.references.push(cholesterolEducation.reference);

  const a1c = a1cSummary(a1cSources(sources), bmi?.a1cEducationalReference
    ?? (Array.isArray(sources) ? sources : []).find((source) => source.kind === 'external_source' && /a1c test/i.test(source.title))?.reference);
  const bloodPressure = systolicSummary(sources, age);
  if (!hasBmi && !cholesterol && !a1c && !bloodPressure) return answer;

  const sentences = [];
  const citations = [];
  if (cholesterol) {
    sentences.push(lipidNarrative(cholesterol));
    citations.push(...cholesterol.references);
  }
  if (hasBmi) {
    citations.push(bmi.weightReference, bmi.heightReference);
    const educationalSource = findSource(sources, bmi.educationalReference);
    if (educationalSource) citations.push(educationalSource.reference);
    if (age !== null && age < 20) {
      sentences.push('Your BMI is ' + roundedValue.toFixed(1) + '; for people under 20, it is read against age- and sex-specific growth charts.');
    } else if (age !== null) {
      sentences.push('At ' + weightValue + ' and ' + heightValue + ', your BMI is ' + roundedValue.toFixed(1) + ', ' + adultCategory(bmiValue) + '. BMI is a screening measure, not a health verdict.');
    } else {
      sentences.push('At ' + weightValue + ' and ' + heightValue + ', your BMI is ' + roundedValue.toFixed(1) + '. If you are 20 or older, it is ' + adultCategory(bmiValue) + '; BMI is one clue, not a diagnosis.');
    }
  }
  if (a1c) {
    sentences.push(a1c.text);
    citations.push(...a1c.references);
  }
  if (bloodPressure) {
    sentences.push(bloodPressure.text);
    citations.push(...bloodPressure.references);
  }

  const nextSteps = followUpSteps({ bmi: hasBmi, cholesterol, a1c, bloodPressure });
  const hasUnclearLabs = Boolean(cholesterol?.needsUnitCheck || a1c?.needsUnitCheck);
  const bmiMeritsReview = hasBmi && (age === null ? bmiValue >= 25 : age >= 20 && bmiValue >= 25);
  const needsRoutineReview = Boolean(cholesterol?.aboveGuide || bloodPressure?.aboveGuide || a1c?.needsReview || bmiMeritsReview);
  const conclusion = [];
  if (cholesterol?.aboveGuide) {
    conclusion.push('A routine clinician review is sensible.');
  } else if (bloodPressure?.aboveGuide) {
    conclusion.push('A routine blood-pressure check is sensible if repeat readings stay at or above 130 mmHg.');
  } else if (a1c?.needsReview) {
    conclusion.push('A clinician can put the HbA1c in context with the original report and your wider health history.');
  } else if (bmiMeritsReview && !cholesterol?.needsUnitCheck) {
    conclusion.push('Blood pressure and other risk factors help put BMI in context.');
  } else if (hasBmi && (cholesterol || a1c) && !needsRoutineReview) {
    conclusion.push('Your age, blood pressure and health history help put these measures in context.');
  }
  if (cholesterol?.needsUnitCheck) conclusion.push('Could you confirm the cholesterol unit on the original report?');
  else if (a1c?.needsValueCheck) conclusion.push('Could you check the HbA1c value and unit on the original report?');
  else if (a1c?.needsUnitCheck) conclusion.push('Could you confirm the HbA1c unit on the original report?');
  else if (age === null && (hasBmi || cholesterol?.aboveGuide)) conclusion.push('Your age helps tailor next steps; how old are you?');
  else if (cholesterol?.aboveGuide) conclusion.push('Have you had your blood pressure checked recently?');
  else if (a1c?.needsReview) conclusion.push('Have you discussed this result with a clinician yet?');
  else if (bmiMeritsReview) conclusion.push('Have you had your blood pressure checked recently?');
  if (conclusion.length) sentences.push(conclusion.join(' '));

  const paragraphs = [];
  if (cholesterol) paragraphs.push(sentences.shift());
  const contextSentences = [];
  if (hasBmi) contextSentences.push(sentences.shift());
  if (a1c) contextSentences.push(sentences.shift());
  if (bloodPressure) contextSentences.push(sentences.shift());
  if (sentences.length) {
    if (contextSentences.length) contextSentences.push(sentences.shift());
    else if (paragraphs.length) paragraphs[0] += ' ' + sentences.shift();
  }
  if (contextSentences.length) paragraphs.push(contextSentences.join(' '));
  if (sentences.length) paragraphs.push(sentences.join(' '));
  return {
    ...answer,
    answer: paragraphs.join('\n\n'),
    citations: [...new Set(citations)].filter(Boolean).slice(0, 20),
    unknowns: [],
    nextSteps,
  };
}

function a1cSources(sources) {
  return currentRecords(sources, /\b(?:hba1c|a1c|glycated hemoglobin)\b/i);
}

function systolicSummary(sources, age) {
  const records = currentRecords(sources, /\b(?:systolic|sbp)\b/i);
  if (!records.length) return null;
  const ordered = [...records].sort((left, right) => String(right.date ?? '').localeCompare(String(left.date ?? '')));
  const source = ordered.find((item) => parseValueAndUnit(item)?.unit === 'mmhg');
  if (!source) {
    const item = ordered[0];
    const detail = String(item.detail ?? 'unit not recorded').split(/[·.]\s/)[0];
    return {
      text: `Your systolic blood-pressure entry (${detail}) needs its unit checked against the original report.`,
      references: [item.reference], needsUnitCheck: true, aboveGuide: false,
    };
  }
  const parsed = parseValueAndUnit(source);
  if (age !== null && age < 20) return {
    text: `Your systolic reading is ${parsed.label} mmHg; adult blood-pressure guides do not apply under age 20.`,
    references: [source.reference], needsUnitCheck: false, aboveGuide: false,
  };
  const conditionalAdult = age === null ? 'If you are an adult, ' : '';
  const number = parsed.value;
  let text;
  if (number >= 130) {
    text = `${conditionalAdult}your systolic reading is ${parsed.label} mmHg, above the common adult top-number guide of 120. One reading does not diagnose high blood pressure; repeated readings and the bottom number matter.`;
  } else if (number >= 120) {
    text = `${conditionalAdult}your systolic reading is ${parsed.label} mmHg, above the common adult normal threshold of 120. The bottom number and repeat readings are needed for full context.`;
  } else if (number < 90) {
    text = `${conditionalAdult}your systolic reading is ${parsed.label} mmHg, below 90; the bottom number, symptoms, and repeat readings matter when interpreting it.`;
  } else {
    text = `${conditionalAdult}your systolic reading is ${parsed.label} mmHg, below the common adult top-number threshold of 120. The bottom number and repeat readings complete the picture.`;
  }
  return { text, references: [source.reference], needsUnitCheck: false, aboveGuide: number >= 130, systolicOnly: true };
}

/** Give a direct high/within-range answer while preserving entries that still need unit verification. */
export function applyProfileResultCheck(answer, measurements, sources) {
  const bmi = measurements?.find((item) => item.kind === 'calculated_bmi');
  const age = Number.isInteger(bmi?.ageAtMeasurement) ? bmi.ageAtMeasurement : null;
  const cholesterol = lipidSummary(sources, age);
  const cholesterolEducation = (Array.isArray(sources) ? sources : []).find((source) => source.kind === 'external_source' && /cholesterol levels/i.test(source.title));
  if (cholesterol && cholesterolEducation) cholesterol.references.push(cholesterolEducation.reference);
  const a1cEducation = (Array.isArray(sources) ? sources : []).find((source) => source.kind === 'external_source' && /a1c test/i.test(source.title));
  const a1c = a1cSummary(a1cSources(sources), a1cEducation?.reference);
  if (!cholesterol && !a1c) return answer;
  const paragraphs = [];
  const citations = [];
  if (cholesterol) {
    paragraphs.push(lipidNarrative(cholesterol));
    citations.push(...cholesterol.references);
  }
  if (a1c) {
    paragraphs.push(a1c.text);
    citations.push(...a1c.references);
  }
  return {
    ...answer,
    answer: paragraphs.join('\n\n'),
    citations: [...new Set(citations)].filter(Boolean).slice(0, 20),
    unknowns: [],
    nextSteps: followUpSteps({ bmi: false, cholesterol, a1c }),
  };
}

/** Explain a selected media topic without pretending its unavailable transcript was reviewed. */
export function applySelectedReadingInsight(answer, source, sources) {
  if (!source?.title) return answer;
  const media = source.mediaType === 'video' ? 'video' : 'article';
  const topic = String(source.topic ?? '').trim();
  const title = String(source.title ?? '').trim();
  const summary = String(source.summary ?? '').replace(/\s+/g, ' ').trim();
  const topicLower = topic.toLowerCase();
  let opening;
  if (summary) {
    const cleanSummary = summary.replace(/^(?:this (?:video|article) )?(?:explains|describes|covers|shows)\s+/i, '');
    opening = 'In "' + title + '", the ' + media + ' description highlights ' + cleanSummary.replace(/[.]$/, '') + '.';
  } else if (/cholesterol/.test(topicLower + ' ' + source.title.toLowerCase())) {
    opening = '"' + title + '" is about understanding cholesterol numbers. A useful takeaway is to read total cholesterol alongside LDL, HDL and triglycerides; the full panel gives more context than the total alone.';
  } else {
    opening = '"' + title + '" is about ' + (topic || title) + '. The title identifies the topic, but the full item content is not available to confirm its specific claims.';
  }

  const cholesterol = /cholesterol|lipid/.test(topicLower + ' ' + source.title.toLowerCase()) ? lipidSummary(sources, null) : null;
  const cholesterolEducation = (Array.isArray(sources) ? sources : []).find((item) => item.kind === 'external_source' && /cholesterol levels/i.test(item.title));
  if (cholesterol && cholesterolEducation) cholesterol.references.push(cholesterolEducation.reference);
  const parts = [opening];
  const citations = [];
  if (cholesterol) {
    parts.push(lipidNarrative(cholesterol));
    citations.push(...cholesterol.references);
  }
  if (!summary) parts.push('I have the title and topic, not the full transcript, so this is topic guidance rather than a summary of exact video claims.');
  const hasPersonalResult = Boolean(cholesterol?.findings.some((finding) => !finding.needsUnitCheck));
  const nextSteps = /cholesterol|lipid/.test(topicLower + ' ' + source.title.toLowerCase())
    ? ['Explain LDL vs HDL', hasPersonalResult ? 'How does my cholesterol result compare?' : 'What does a full lipid panel show?']
    : /blood sugar|glucose|hba1c|diabetes/.test(topicLower + ' ' + source.title.toLowerCase())
      ? ['What does HbA1c measure?', 'How do I check my result units?']
      : ['What is the key takeaway?', 'How does this topic relate to my health?'];
  return {
    ...answer,
    answer: parts.filter(Boolean).join(' '),
    citations: [...new Set([...(Array.isArray(answer.citations) ? answer.citations : []), ...citations])].slice(0, 20),
    unknowns: [],
    nextSteps,
  };
}
