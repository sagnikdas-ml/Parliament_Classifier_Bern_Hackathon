# Hack Apertus: labelled parliamentary affairs

Labelled data for the challenge "Topic classification for Swiss parliaments with Apertus", from
OpenParlData.ch. Snapshot of 2026-10-18.

- All federal affairs (body `CHE`) with the topic labels assigned by the Parliamentary Services in Curia Vista,
  and their texts in DE/FR/IT.
- Cantonal and municipal affairs from St. Gallen, Thurgau, the city of Zug and Zurich with the classification
  of their own parliament.
- The Année Politique Suisse (APS) thematic scheme as a target classification.

## Files

In every file, `openparldata_id` is the **OpenParlData affair ID** (`https://api.openparldata.ch/v1/affairs/{openparldata_id}`).
Source-system IDs have their own columns: `affair_external_id` (ID in the parliament's system, e.g. Curia Vista)
and, only in `politmonitor_digitalisierung.csv`, `politmonitor_id`.

| File | Content |
|---|---|
| `che_affairs_keywords.csv` / `.jsonl` | One row per affair (70,008): `openparldata_id`, Curia Vista ID, number, type, date, titles DE/FR/IT, URL, subject areas (IDs and names DE/FR/IT), descriptors (DE) |
| `che_affair_keywords_long.csv` | One row per affair and keyword, `classification` = `topic` or `descriptor` |
| `che_topics_vocabulary.csv` | The 28 subject areas in DE/FR/IT with the number of affairs |
| `che_affair_texts.ndjson.gz` | One row per affair text (210,437): submitted text, Federal Council answer, reasoning, title, each in DE/FR/IT |
| `cantonal_affairs_keywords.csv` / `.jsonl` | Cantonal and municipal affairs with the classification of their own parliament (SG, TG, city of Zug, ZH), one row per affair |
| `cantonal_affair_keywords_long.csv` | Same, one row per affair and keyword |
| `cantonal_keywords_vocabulary.csv` | All cantonal keywords with code and number of affairs |
| `politmonitor_digitalisierung.csv` | 3,433 federal, cantonal and municipal affairs tagged "Digitalisierung" by the PolitMonitor editorial team, mapped to `openparldata_id` |
| `dvs_digitalisierung.csv` | 30 recent federal and cantonal affairs on digitalisation as listed by Digital Public Services Switzerland (DVS), mapped to `openparldata_id` |
| `aps_topics.xlsx` | Année Politique Suisse thematic scheme: 8 domains, 22 chapters, 165 topics in DE/FR with links (sheets Topics, Chapters, Domains, Info) |

## Examples

### Federal affairs (`che_affairs_keywords.csv`, selected columns)

| openparldata_id | number | type_en | begin_date | title_de | topic_ids | topics_de | topics_fr | descriptors_de |
|---|---|---|---|---|---|---|---|---|
| 70435 | 24.3010 | Postulate | 2024-02-02 | Verstärkte Unterstützung für Aus- und Weiterbildungen bei der Rückkehr in die Arbeitswelt | 32 \| 44 \| 2836 | Bildung \| Beschäftigung und Arbeit \| Sozialer Schutz | Éducation \| Emploi et travail \| Protection sociale | |
| 211070 | 10.3010 | Motion | 2010-01-11 | Güterverkehrsverlagerung. Für eine schrittweise Reduktion des alpenquerenden Schwerverkehrs | 48 | Verkehr | Transports | Verkehrsverlagerung \| Alpentransitverkehr \| Reduktion \| Güterverkehr auf der Strasse \| Modal Split \| Güterverkehr auf der Schiene |
| 49757 | 05.3010 | Interpellation | 2005-02-28 | Preisgestaltung von neuen patentgeschützten Medikamenten | 2841 | Gesundheit | Santé | Medikament \| Patent \| Preisfestsetzung \| Preisunterschied \| Wirtschaftlichkeitskontrolle \| Evaluation \| Preisrückgang \| Arzneikosten |

Multi-valued fields are joined with ` | ` in the CSV and are arrays in the JSONL. Recent affairs have
subject areas only; affairs up to about 2015 also have descriptors.

### Same affair in long format (`che_affair_keywords_long.csv`)

| openparldata_id | affair_external_id | classification | keyword_external_id | keyword_de | keyword_fr | keyword_it | sort |
|---|---|---|---|---|---|---|---|
| 211070 | 20103010 | topic | 48 | Verkehr | Transports | Trasporti | 1 |
| 211070 | 20103010 | descriptor | L04K18020211 | Verkehrsverlagerung | | | 1 |
| 211070 | 20103010 | descriptor | L05K1801010101 | Alpentransitverkehr | | | 2 |
| 211070 | 20103010 | descriptor | L04K18010304 | Modal Split | | | 5 |

### Texts of one affair (`che_affair_texts.ndjson.gz`, text shortened, HTML removed)

| text_id | type_de | type_fr | text_de | text_fr |
|---|---|---|---|---|
| 184707 | Titel des Geschäftes | Titre de l'objet | Verstärkte Unterstützung für Aus- und Weiterbildungen bei der Rückkehr in die Arbeitswelt | Renforcer le soutien aux formations continues et aux reconversions professionnelles ... |
| 184709 | Eingereichter Text | Texte déposé | Der Bundesrat wird beauftragt, in einem Bericht darzulegen, wie Personen finanziell unterstützt werden können, ... | Le Conseil fédéral est chargé d'établir un rapport expliquant comment apporter un soutien financier ... |
| 184710 | Begründung | Développement | Personen, die freiwillig ihr Arbeitspensum reduzieren oder aufgeben, können kaum von Massnahmen der Arbeitslosenversicherung profitieren. ... | Les personnes qui, volontairement, réduisent leur temps de travail ou quittent le monde du travail ... |
| 184708 | Antwort BR / Büro | Réponse CF / Bureau | Der Wiedereinstieg von Personen und namentlich von Frauen ins Berufsleben ... | Le Conseil fédéral attache lui aussi une grande importance à la réinsertion professionnelle ... |

One line in the file (shortened):

```json
{"openparldata_id": 70435, "affair_external_id": "20243010", "number": "24.3010", "text_id": 184709,
 "type_de": "Eingereichter Text", "type_fr": "Texte déposé", "type_it": "Testo depositato", "type_en": null,
 "format": "text", "text_de": "<p>Der Bundesrat wird beauftragt, ...</p>", "text_fr": "<p><span style=\"background-color :white ;...\">Le Conseil fédéral est chargé ...</span></p>",
 "text_it": "<p>Il Consiglio federale è incaricato ...</p>"}
```

### Cantonal and municipal affairs (`cantonal_affairs_keywords.csv`, selected columns)

| openparldata_id | body_key | number | type_en | begin_date | title_de | keywords | keyword_codes |
|---|---|---|---|---|---|---|---|
| 79359 | SG | 61.24.01 | Question | 2024-01-03 | Ist St.Gallen bereit für die «Digitale Verwaltung»? | Arbeit und Gewerbe | |
| 169631 | SG | 61.24.02 | Question | 2024-01-08 | Bilaterale weiterentwickeln – eine grosse Chance für den Kanton St.Gallen | Grundlagen und Organisation | |
| 173057 | TG | 20/EA 249/627 | Question | 2024-01-10 | Digitalisierung, Vereinfachung oder doch wieder zusätzliche Arbeit | Gebiet, Organisation, Reglemente, Verwaltung | 13.1 |
| 82879 | TG | 20/EA 255/633 | Question | 2024-01-24 | Thurgauer Industrie und CO2 | Umweltschutz: Allgemein, Boden, Wasser, Luft, Abfall | 81.4 |
| 5110 | 1711 | 11.24 | information document | 2024-01-03 | Sicherheit und Verkehr: Öffentlicher Verkehr; Standseilbahn Schönegg-Zugerberg ... | Sicherheit und Verkehr | |
| 182641 | ZH | VNL1001624 | Consultation | 2024-04-04 | Gesetz über die Gerichts- und Behördenorganisation im Zivil- und Strafprozess (GOG; Änderung) ... | GOG \| BEKJ \| Elektronische Verfahrenshandlungen | |

### APS scheme (`aps_topics.xlsx`, sheet Topics)

| code | domain_de | domain_fr | chapter_de | chapter_fr | topic_de | topic_fr |
|---|---|---|---|---|---|---|
| 1.1.1 | Akteure und Institutionen | Institutions et acteurs | Politische Grundfragen | Problèmes politiques fondamentaux | Nationale Identität | Identité nationale |
| 4.4.4 | Gesellschaft und Kultur | Société et culture | Medien | Médias | Digitale Medien | Médias numériques |
| 5.1.8 | Gesundheit und Sozialsystem | Santé et système social | Gesundheit, Sozialhilfe, Sport | Santé, assistance sociale, sport | Epidemien und Pandemien | Epidémies et pandémies |
| 6.1.9 | Infrastruktur und Umwelt | Infrastructures et environnement | Verkehr und Kommunikation | Transports et communications | Digitalisierung | Numérisation |

## Labels

- **Subject areas** (`topic`, Curia Vista "Sachbereiche"): 28 categories, multi-label (about 2 per affair).
  Available for almost all affairs from 2000 onwards (about 98 %), missing for nearly all older affairs.
- **Descriptors** (`descriptor`, Curia Vista "Schlagwoerter"): fine-grained thesaurus terms, German only,
  `keyword_external_id` is the thesaurus key. 177,597 descriptors for 31,222 affairs, assigned from 1996
  to mid-2014 (about 97 % of the affairs in those years, about 5 per affair), none from 2015 onwards.

## Cantonal and municipal classifications (`cantonal_*`)

Four parliaments publish their own classification with each affair. The schemes differ, so treat each
body separately (column `keyword_kind`):

| `body_key` | Parliament | Affairs | Keywords | What the keyword is |
|---|---|---|---|---|
| `SG` | Kantonsrat St. Gallen | 6,792 | 10 | Subject area of the cantonal law collection, one per affair (e.g. "Verkehr, Bau, Energie, Gewässer") |
| `TG` | Grosser Rat Thurgau | 2,382 | 118 | Subject area with systematic code, one per affair (e.g. "72.3 Strassenwesen"). The part before the dot is the main group (e.g. 72) |
| `1711` | Grosser Gemeinderat Stadt Zug | 1,343 | 37 | Responsible department (e.g. "Soziale Dienste", "Tiefbau"). An administrative unit, only partly a topic |
| `ZH` | Kanton Zürich | 225 | 724 | Free keywords, several per item. These are consultations (Vernehmlassungen), not parliamentary affairs |

Notes:
- `openparldata_id` is the OpenParlData ID, so texts and documents are available via
  `https://api.openparldata.ch/v1/affairs/{openparldata_id}/docs`. These parliaments publish almost no affair texts,
  the content is in the documents. Titles are German only.
- TG names appear in the source with and without code. They are normalised to name plus `keyword_code`.
- 1,357 TG keyword rows point to affairs that are not (or no longer) in OpenParlData and are left out.

## DVS use case: digitalisation (`politmonitor_digitalisierung.csv`)

PolitMonitor (glue) monitors federal and cantonal affairs and tags them by topic. Its editorial keyword
"Digitalisierung / Numérisation / Digitalizzazione" is the source of the DVS list of political affairs on
digitalisation. This file contains every affair the PolitMonitor editorial team has tagged with it
(snapshot 2026-10-18), mapped to the OpenParlData `openparldata_id`. Tags set by individual PolitMonitor customers
are not included.

- 3,433 affairs from 35 parliaments: CHE 1,448, then BE 171, ZH 146, VD 143, VS 141, BS 139, BL 128, GE 119,
  LU 112, TI 91 and all other cantons, plus a few cities.
- Mostly 2018 to 2026 (about 98 %), only a few older affairs from 2009 onwards.
- Languages: titles in the language of the parliament, every affair has at least one title.
  1,377 of the 1,448 federal affairs have titles in DE, FR and IT.
- Mapping: federal affairs via the Curia Vista ID, cantonal affairs via the OpenParlData ID stored in PolitMonitor.
  64 tagged affairs are left out because they have no OpenParlData counterpart.
- `politmonitor_scope` / `politmonitor_id` identify the affair in PolitMonitor.
- 29 of the 30 affairs in `dvs_digitalisierung.csv` are in this file.

| openparldata_id | body_key | number | begin_date | type_en | title |
|---|---|---|---|---|---|
| 235308 | CHE | 25.3011 | 2025-01-27 | Motion | Die Rolle von Hosting- und Cloud-Anbietern bei der Bewältigung von Cyberangriffen ... |
| 221156 | ZG | 3896 | 2025-03-15 | Postulate | Schaffung von Grundlagen für die erfolgreiche Anwendung von KI-Modellen ... |
| 247811 | GE | M 3088 | 2025-01-06 | | Création d'un fonds audiovisuel cantonal : pour l'attractivité économique ... |
| 329562 | TI | MO1920 | 2026-05-18 | Motion | Per un'intelligenza artificiale pubblica svizzera ... |

The file contains positives only. For an evaluation, take the affairs of the same parliaments and period that
are not in the file as negatives. Some of them will be digitalisation affairs the editors did not tag, so treat
precision against this list as a lower bound. The tag is broad: it covers e-government, cybersecurity, AI, data
protection, digital media and broadband.

## DVS list (`dvs_digitalisierung.csv`)

Digital Public Services Switzerland (DVS) publishes the current federal and cantonal affairs on
digitalisation at https://www.digitale-verwaltung-schweiz.ch/aktuelles/politische-geschaefte
(source: PolitMonitor). The file contains the 30 affairs listed there on 2026-10-18, each mapped to the
OpenParlData `openparldata_id` via its source URL (all 30 matched).

| openparldata_id | body_key | number | dvs_date | title |
|---|---|---|---|---|
| 337367 | CHE | 26.066 | 2026-11-23 | Breitbandfördergesetz (BBFG) |
| 339810 | ZH | VNL1002005 | 2026-12-18 | Gesetz über egovpartner |
| 303044 | BE | 2026.GRPARL.123 | 2026-11-23 | eBau - elektronisches Baubewilligungsverfahren im Kanton Bern ... |
| 335263 | ZG | 4134 | 2026-10-29 | Zugänglichkeit von e.Tax Zug und AGOV |

Bodies: BE 12, CHE 5, OW 3, ZG 3, TG 2, ZH, AG, BL, VS, GE 1 each. All are positives: the page lists only
affairs tagged with digitalisation, so there are no negative examples. Use the file as a small check for an
ad-hoc topic "Digitalisierung" across levels and languages, not as a full evaluation set.

## APS scheme (`aps_topics.xlsx`)

The Année Politique Suisse classification as published on https://anneepolitique.swiss/de/themen/
(retrieved 2026-10-18): domain > chapter > topic, for example "Gesellschaft und Kultur > Medien > Digitale Medien".
Chapter > topic is the two-level scheme mentioned in the challenge. APS publishes the labels in German and
French only. The `code` column (domain.chapter.topic) follows the order on the APS page and is not an official
APS identifier. The affairs in this folder are not labelled with APS topics. Use the scheme as the target
for zero-shot classification, and the Curia Vista subject areas as a rough check.

## Texts (`che_affair_texts.ndjson.gz`)

Gzipped NDJSON, one JSON object per line and text. Read it with e.g.
`pandas.read_json("che_affair_texts.ndjson.gz", lines=True)` or `gzip -dc che_affair_texts.ndjson.gz | jq`.

Fields: `openparldata_id`, `affair_external_id`, `number`, `text_id`, `type_de` / `type_fr` / `type_it` / `type_en`,
`format`, `text_de`, `text_fr`, `text_it`.

| `type_de` | `type_fr` | Texts | Content |
|---|---|---|---|
| Titel des Geschäftes | Titre de l'objet | 68,795 | Title of the affair |
| Eingereichter Text | Texte déposé | 63,724 | Text of the motion, postulate, interpellation etc. as submitted |
| Antwort BR / Büro | Réponse CF / Bureau | 50,918 | Answer or opinion of the Federal Council (or the Council Bureau) |
| Begründung | Développement | 25,664 | Reasoning given by the authors |
| Lead | | 636 | Short summary (mainly consultations) |
| (empty) | | 695 | Texts without a type, no German version |
| others | | 5 | Draft, document references, motion to the second council |

Notes:
- Nearly all texts exist in DE, FR and IT (official translations by the Parliamentary Services). A few
  hundred lack FR or IT, in that case the field is `null`.
- Texts partly contain HTML markup (`<p>`, `<br>`, `<span style=...>`), even where `format` is `text`.
  Strip tags before tokenising.
- Uncompressed size is about 715 MB. The Federal Council answers are the longest texts.
- The documents attached to affairs (PDFs with extracted text) are not included. They are available in
  the general export at https://files.openparldata.ch/exports/ and via `/v1/affairs/{openparldata_id}/docs`.

## Joining

- `openparldata_id` is the OpenParlData ID: `https://api.openparldata.ch/v1/affairs/{openparldata_id}`, also `/texts` and `/docs`.
- `affair_external_id` is the Curia Vista ID: `https://www.parlament.ch/de/ratsbetrieb/suche-curia-vista/geschaeft?AffairId={affair_external_id}`.
- Texts are joined on `openparldata_id`. They partly contain HTML markup (`<p>`, `<br>`), even where `format` is `text`.

## Suggested use

Use the subject areas as ground truth for the standard classification (e.g. train/validate on 2000 to 2023,
test on 2024 to 2026) and the descriptors as a check for ad-hoc topics. Labels reflect the Parliamentary
Services' assignment, not an independent gold standard.

Source: Parliamentary Services of the Federal Assembly (Curia Vista, ws.parlament.ch), via OpenParlData.ch.
