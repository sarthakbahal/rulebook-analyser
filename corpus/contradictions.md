# Contradictions Register

This file records the three contradictions deliberately planted into the benchmark corpus. They are intentional test conditions, not errors to be silently reconciled.

## Contradiction 1 - Attendance vs Medical Exemption

**Source A:** `academic_handbook.pdf`, Page 4

> "A student must maintain a minimum of 75% attendance to appear for the end-semester exam. No exceptions are granted."

**Source B:** `hostel_rules.md`, Section 3.2

> "In case of hospitalization, attendance up to 20% can be waived by the Dean upon submission of medical certificates, allowing eligibility at 55% attendance."

**Conflict:** One statement sets an unconditional 75% minimum with no exceptions; the other permits hospitalization-based eligibility at 55%.

## Contradiction 2 - Hostel Curfew Penalty

**Source A:** `hostel_rules.md`, Section 1.4

> "Entering the hostel after 10:00 PM incurs an automated fine of $50."

**Source B:** `hostel_rules.md`, Section 5.1

> "First-time late entry after 10:00 PM will result in a written warning only; fines apply strictly from the second offense."

**Conflict:** Section 1.4 imposes a $50 fine for late entry generally, while Section 5.1 says the first late entry is warning-only and a fine starts on the second offense.

## Contradiction 3 - Library Refund Deadline

**Source A:** `fee_deadlines.md`, Table 2

> "Library caution deposit refund must be claimed within 30 days of graduation."

**Source B:** `academic_handbook.pdf`, Page 18

> "Library security clearance and refund claims remain valid for up to 1 year post-graduation."

**Conflict:** The refund claim window is either 30 days after graduation or up to one year after graduation; both cannot be simultaneously applied as the sole deadline.

## Evaluation guidance

A contradiction-aware system should surface both statements when a question targets one of these conflicts. It should not invent a hierarchy between the two documents unless a separate rule expressly establishes precedence.
