-- Starting data: ledgers, pots and the settings from the Bidii Pricing Guide
-- and the two shareholders' agreements. People are added by scripts/invite.mjs
-- because each needs a sign-in account first.

insert into public.ledgers (id, name, kind) values
  ('company', 'Trillionaire Designs', 'company'),
  ('bidii', 'Bidii', 'product');

insert into public.pots (id, ledger_id, key, name, class_a_only) values
  ('bidii.pool',     'bidii',   'pool',     'Team pool',                 false),
  ('bidii.payout',   'bidii',   'payout',   'Owners'' payout',           false),
  ('bidii.growth',   'bidii',   'growth',   'Bidii growth',              false),
  ('bidii.product',  'bidii',   'product',  'Bidii product',             false),
  ('bidii.reserve',  'bidii',   'reserve',  'Bidii reserve',             false),
  ('bidii.advance',  'bidii',   'advance',  'Advance fees held',         false),
  ('bidii.bills',    'bidii',   'bills',    'Bills',                     false),
  ('company.fee',    'company', 'fee',      'Trillionaire Designs fee',  true),
  ('company.growth', 'company', 'growth',   'Class A growth fund',       true),
  ('company.costs',  'company', 'costs',    'Company costs',             true);

insert into public.settings (ledger_id, key, value, approval_rule, effective_from, status, reason) values
  ('bidii', 'split',
   '{"pool":0.3,"payout":0.2,"fee":0.1,"growth":0.2,"product":0.1,"reserve":0.1}',
   'all_shareholders', '2026-01-01', 'active', 'Bidii Shareholders'' Agreement 7.4'),
  ('bidii', 'weights',
   '{"miguel":40,"romeo":22,"samuel":15,"ruth":15,"larmeck":15}',
   'all_shareholders', '2026-01-01', 'active', 'Bidii Earnings and Pay Structure'),
  ('bidii', 'shares',
   '{"classAShareOfBidii":72,"classAParts":{"miguel":75,"romeo":15},"classBParts":{"samuel":7,"ruth":6,"larmeck":5}}',
   'all_shareholders', '2026-01-01', 'active', 'Shareholders'' Agreements 3.3 and 7.5'),
  ('bidii', 'fee', '{"rate":0.1,"reviewEveryMonths":12}',
   'both_classes', '2026-01-01', 'active', 'Bidii Shareholders'' Agreement 2.14 and 2.15'),
  ('bidii', 'commission', '{"team":0.03,"outside":0.05,"base":"first_year_subscription_paid"}',
   'all_shareholders', '2026-01-01', 'active', 'Agreed rates; outside referrers 5%'),
  ('bidii', 'reserve', '{"targetMonths":6}',
   'all_shareholders', '2026-01-01', 'active', 'Bidii Shareholders'' Agreement 7.4'),
  ('bidii', 'missCuts', '[0.25,0.5,1]',
   'all_shareholders', '2026-01-01', 'active', 'Bidii Earnings and Pay Structure'),
  ('bidii', 'requests', '{"singleApproverLimit":20000,"receiptDays":3}',
   'both_cofounders', '2026-01-01', 'active', 'Bidii Earnings and Pay Structure'),
  ('bidii', 'payout', '{"cycle":"monthly","paymentDay":null,"minimumPool":5000}',
   'both_cofounders', '2026-01-01', 'active', 'Bidii Earnings and Pay Structure'),
  ('bidii', 'pricing',
   '{"tiers":[{"upTo":300,"rate":150},{"upTo":800,"rate":120},{"upTo":null,"rate":100}],
     "lowFeeCapRate":100,
     "onboarding":{"small":5000,"medium":7500,"large":9000},
     "onboardingBands":{"mediumFrom":301,"largeFrom":801},
     "yearlyDiscount":0.1,"groupDiscount":0.1,"groupMinCampuses":3,"termsPerYear":3,
     "freeStartWeeks":7,"invoiceDueDays":14,"extraMessaging":{"perThousand":1000}}',
   'both_cofounders', '2026-01-01', 'active', 'Bidii Pricing Guide');

insert into public.share_register (holder_id, share_class, parts, issued, note) values
  (null, 'A', 10, false, 'Class A reserved pool'),
  (null, 'B', 10, false, 'Class B reserved pool');
