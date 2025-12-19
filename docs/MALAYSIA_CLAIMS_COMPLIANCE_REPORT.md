# Analysis: Malaysia Insurance Claim Best Practices & Regulations

## 1. Regulatory Framework (Bank Negara Malaysia - BNM)
Claims handling in Malaysia must comply with BNM's **Financial Services Act 2013** and specific guidelines:
- **BNM/RH/GL 003-24**: Guidelines on Claims Management.
- **Treating Customers Fairly (TCF)**: Requires transparency, timely updates, and fair settlements.
- **Service Level Agreements (SLA)**: 
    - Acknowledge claim within **7 working days**.
    - Final decision within **6 months** for standard claims.
    - Updates provided every **14 days** (best practice).

## 2. Motor Claim Requirements (PIAM Standards)
The General Insurance Association of Malaysia (PIAM) sets the standard for motor claims:
- **Police Report**: Mandatory for any claim > RM 300 (usually). Must include Station Name and Serial No.
- **Vehicle Verification**: Plate number, Make/Model, and Chassis/Engine number for fraud prevention.
- **Workshop Selection**: Must be from the insurer's **Panel Workshops** or PIAM-approved workshops (PARS).
- **Damage Types**: 
    - **Own Damage (OD)**: Claiming against own policy.
    - **OD-KFK (Knock-for-Knock)**: Faster processing when the other party is at fault.
    - **Third Party Property Damage (TPPD)**.

## 3. Essential Info Missing in Current UI
Based on the review of detail.tsx and the Prisma schema, the following are missing:

| Category | Missing Field | Why it matters |
| :--- | :--- | :--- |
| **Police** | Station Name, Report Date | Validation against police database. |
| **Vehicle** | Plate No, Chassis No, Make/Model | Fraud prevention and parts ordering. |
| **Policy** | NCD Status, Sum Insured, Policy Type | Determining liability and payout limits. |
| **Financial** | Damage Estimate (MYR), SST (6/8%) | Financial accuracy and tax compliance. |
| **Regulation** | Days in Queue (SLA tracking) | BNM compliance for timely settlement. |
| **Compliance** | PDPA Consent Tag | Legal requirement for data processing. |

## 5. Mandatory Regulatory Roles
To satisfy BNM and PDPA requirements, the system supports:
- **SIU Investigator**: Fraud detection and pattern analysis (BNM Anti-Fraud).
- **Compliance Officer**: Regulatory auditing and PDPA oversight.
- **Support Desk**: Transparent customer grievance handling (TCF Framework).
- **Shariah Reviewer**: Governance for Takaful products.
