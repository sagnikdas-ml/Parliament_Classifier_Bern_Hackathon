import json

from parliament import classifier, db

TOPIC_ID = "focus:digitalisation:v1"
NAME = "Digitalisation monitoring"
DEFINITION = (
    "Identify affairs whose substantive policy subject is digitalisation. Include digital public services, "
    "e-government, electronic identity and procedures, government IT and cloud infrastructure, cybersecurity, "
    "artificial intelligence, data protection and digital rights, digital media and platforms, broadband and "
    "digital connectivity. Include these subjects in any sector, not only public administration. "
    "Exclude affairs that merely mention a website, email, electronic document, or routine IT tool; "
    "exclude general administration, conventional broadcasting, postal services, and physical infrastructure "
    "unless a substantive digital-policy issue is established. Judge the target affair, not unrelated "
    "items in attached meeting minutes. Missing substantive evidence means insufficient evidence, not a negative."
)
KEYWORDS = {
    "de": ["Digitalisierung", "digital", "Informatik", "Cybersicherheit", "Datenschutz", "Breitband", "E-ID", "künstliche Intelligenz"],
    "fr": ["numérisation", "numérique", "informatique", "cybersécurité", "protection des données", "haut débit", "intelligence artificielle"],
    "it": ["digitalizzazione", "digitale", "informatica", "cibersicurezza", "protezione dei dati", "banda larga", "intelligenza artificiale"],
}


def ensure_topic():
    existing = db.query("SELECT * FROM topics WHERE id=?", [TOPIC_ID])
    if existing:
        item = existing[0]
        if item["definition"] != DEFINITION or json.loads(item["raw"]) != KEYWORDS or item["version"] != 1:
            raise ValueError("The fixed digitalisation scope was modified. Restore it or publish a new scope ID.")
    else:
        classifier.save_topic(NAME, DEFINITION, KEYWORDS, TOPIC_ID)
    return {"id": TOPIC_ID, "name": NAME, "definition": DEFINITION, "version": 1}


def keyword_match(text):
    lowered = text.casefold()
    return any(term.casefold() in lowered for values in KEYWORDS.values() for term in values)
