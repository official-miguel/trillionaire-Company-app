// Who must approve a spending request ("Spending requests and approvals").
// Approval is a permission, not a name: anyone holding `approver` on the
// ledger can approve up to their limit; above it, two second signers.

export interface Approver {
  slug: string;
  name: string;
  approverLimit: number | null; // null = cannot approve
  secondSigner: boolean;
}

export interface RequestFacts {
  requesterSlug: string;
  amount: number;
  potKey: string; // 'growth', 'product', 'reserve', 'fee', ...
  approvedBy: string[]; // slugs that already approved
}

export interface ApprovalNeed {
  needed: number;
  eligible: Approver[];
  done: boolean;
  /** Plain words for the button: "This sends your request to Romeo". */
  summary: string;
  tellClassB: boolean;
}

export function approvalNeed(req: RequestFacts, approvers: Approver[], singleLimit = 20000): ApprovalNeed {
  const notSelf = approvers.filter((a) => a.slug !== req.requesterSlug);
  const twoSigners = req.potKey === "reserve" || req.amount > singleLimit;

  const eligible = twoSigners
    ? notSelf.filter((a) => a.secondSigner)
    : notSelf.filter((a) => a.approverLimit !== null && a.approverLimit >= req.amount);

  const needed = twoSigners ? 2 : 1;
  const approvedCount = req.approvedBy.filter((s) => eligible.some((a) => a.slug === s)).length;
  const names = eligible.map((a) => a.name.split(" ")[0]);

  let summary: string;
  if (eligible.length < needed) summary = "Nobody can approve this yet. Ask Miguel or Romeo to check the approval roles in Settings.";
  else if (twoSigners) summary = `This needs both ${names.slice(0, 2).join(" and ")} to approve.`;
  else summary = `This sends your request to ${names.join(" or ")}.`;

  return { needed, eligible, done: approvedCount >= needed, summary, tellClassB: req.potKey === "reserve" };
}
