# ParlaRadar demo examples

Paste each passage into **Fact-check** and keep the suggested language. These
stories point to affairs already stored in the local DuckDB archive. The
deliberately incorrect claims are designed to trigger an evidence-backed
replacement; a missing match must remain *unverified*, never be treated as
false. Sentence-level outputs can vary with retrieval and model responses.

## 1. AI infrastructure · English · mixed scope

Tests an explicit parliamentary anchor, a correct report, a false claim the
archive can correct, and an unrelated apolitical sentence.

> The Swiss parliamentary affair “Künstliche Intelligenz als Infrastruktur” describes Apertus as a fully open language model developed in Switzerland. The same text says Apertus is a closed product owned by a US company. I made coffee before opening this page.

Expected demonstration: support the first claim; flag and replace the second
with the record’s description of Apertus as a fully open Swiss model; mark the
coffee sentence apolitical and keep it out of editorial review.

Source: [Künstliche Intelligenz als Infrastruktur](https://api.openparldata.ch/v1/affairs/340832)

## 2. Military Academy at ETH Zurich · German · false generalisation

Tests German scope detection and a correction grounded in an explicit “only”.

> Das parlamentarische Geschäft «Stärkung der Eidgenössischen Militärakademie an der ETH Zürich (MILAK)» hält fest, dass sicherheits- und militärbezogene Forschung mit Schweizbezug institutionell nur an der MILAK verankert ist. Der Bericht sagt, diese Forschung sei dauerhaft an allen Schweizer Hochschulen institutionell verankert.

Expected demonstration: preserve the first sentence’s attribution to the
affair; flag the second sentence and correct it to the narrower statement in
the record. Do not turn the affair’s position into an independently verified
fact about all Swiss research.

Source: [Stärkung der Eidgenössischen Militärakademie an der ETH Zürich (MILAK)](https://api.openparldata.ch/v1/affairs/340685)

## 3. Support for children after COVID-19 · French · reversed proposal

Tests French sentence checking and the difference between asking for support
and proposing cuts. The source is a parliamentary question, not proof that
funding was later granted.

> Dans l’affaire « Crise du coronavirus. Davantage de moyens pour soutenir les enfants et les adolescents », la question demande si le Conseil fédéral est prêt à prévoir des moyens financiers supplémentaires pour les droits et la protection de l’enfant. L’affaire propose au contraire de réduire ces aides.

Expected demonstration: support the description of what the question asks;
flag the reversed claim and replace it with the source’s request for additional
financial support. Do not state that the money was actually awarded.

Source: [Crise du coronavirus. Davantage de moyens pour soutenir les enfants et les adolescents](https://api.openparldata.ch/v1/affairs/66010)

## 4. Access to AI and productivity · Italian · reversed assertion

Tests Italian input against the Italian title and text of the AI infrastructure
affair.

> L’affare parlamentare «L’intelligenza artificiale come infrastruttura» afferma che l’accesso a sistemi di IA ad alte prestazioni è sempre più importante per la produttività e la capacità d’innovazione delle istituzioni pubbliche. Il testo sostiene anche che questo accesso non ha alcun effetto sulla produttività.

Expected demonstration: support the first report of the text; flag the second
sentence and replace it with the passage’s statement that access increasingly
affects productivity and innovation.

Source: [L’intelligenza artificiale come infrastruttura](https://api.openparldata.ch/v1/affairs/340832)

## 5. School canteen operating costs · Romansh · unsupported funding claim

Tests Romansh retrieval on a Graubünden affair and a correction about the
government response. The answer is specific to the education sectors named in
the source.

> En l’incumbensa «Incumbensa Degiacomi concernent contribuziuns da manaschi e da construcziun per las mensas da las scolas professiunalas spezialisadas», la Regenza tracta il sustegn per las cantinas da las scolas professiunalas. Ella scriva che las scolas survegnan contribuziuns chantunalas da manaschi per tut ils custs da las mensas.

Expected demonstration: flag the funding claim and replace it with the
response’s position that operating contributions are not planned for the
specified vocational-education sectors and that canteens must cover their
operating costs. Check the cited Romansh passage before using the replacement.

Source: [Incumbensa Degiacomi concernent contribuziuns da manaschi e da construcziun per las mensas da las scolas professiunalas spezialisadas](https://api.openparldata.ch/v1/affairs/165570)
