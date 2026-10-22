"""Wikipedia-Spiel: Dem ersten gültigen Link bis zur Philosophie folgen.

Installation: python -m pip install selenium pytest
Start:        python philosophy_wiki_game.py [Artikel] [--target WORT] [--steps N]
Tests:        python -m pytest philosophy_wiki_game.py -v
Mit --no-visualize entfällt die rote Markierung samt kurzer Pause.
Chrome, Firefox und Edge werden der Reihe nach ausprobiert.
"""
import argparse
import os
import time
from urllib.parse import quote, unquote, urlparse

import pytest
from selenium import webdriver
from selenium.common.exceptions import WebDriverException
from selenium.webdriver.common.by import By
from selenium.webdriver.support import expected_conditions as EC
from selenium.webdriver.support.ui import WebDriverWait

BASE_URL = "https://de.wikipedia.org/wiki/"
TARGET = "philosophie"
MAX_STEPS = 50

# Das Skript relativ zu dieser Datei laden, unabhängig vom Arbeitsverzeichnis.
_JS_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "first_link.js")
with open(_JS_PATH, encoding="utf-8") as _f:
    FIRST_LINK_JS = _f.read()


def create_browser():
    """Den ersten Browser starten, dessen WebDriver verfügbar ist."""
    for browser in (webdriver.Chrome, webdriver.Firefox, webdriver.Edge):
        try:
            return browser()
        except WebDriverException:
            continue

    raise RuntimeError("Chrome, Firefox und Edge konnten nicht gestartet werden.")


def current_title(driver):
    """Bis zu zehn Sekunden auf die Artikelüberschrift warten und sie lesen."""
    heading = WebDriverWait(driver, 10).until(
        EC.presence_of_element_located((By.ID, "firstHeading"))
    )
    return heading.text.strip()


def play(driver, start_article, max_steps=MAX_STEPS, target=TARGET, show=True):
    """Besuchte Titel und Abbruchgrund zurückgeben.

    TARGET: Ziel erreicht; LOOP: Titel erneut besucht;
    DEAD_END: kein gültiger Link; LIMIT: maximale Anzahl Artikel erreicht.
    Auch der Startartikel zählt als Schritt.
    """
    if max_steps < 1:
        raise ValueError("max_steps muss mindestens 1 sein.")

    # Leerzeichen und Sonderzeichen für die Artikeladresse kodieren.
    driver.get(BASE_URL + quote(start_article.replace(" ", "_")))
    path, visited = [], set()

    for step in range(1, max_steps + 1):
        title = current_title(driver)
        if driver.find_elements(By.CSS_SELECTOR, "#mw-content-text .noarticletext"):
            raise ValueError(f"Wikipedia-Artikel existiert nicht: {title}")
        path.append(title)
        print(f"{step:>2}. {title}")

        # Die bisherige Teilwortsuche beibehalten; Gross-/Kleinschreibung ignorieren.
        if target.casefold() in title.casefold():
            return path, "TARGET"
        if title in visited:
            return path, "LOOP"
        visited.add(title)

        # Nach dem letzten erlaubten Artikel keine weitere Seite mehr laden.
        if step == max_steps:
            return path, "LIMIT"

        # JavaScript sucht den ersten Link gemäss den Spielregeln im Artikeltext.
        link = driver.execute_script(FIRST_LINK_JS)
        if link is None:
            return path, "DEAD_END"

        if show:
            visualize(driver, link)

        driver.get(link.get_attribute("href"))

    return path, "LIMIT"

def visualize(driver, link):
    """Den nächsten Link sichtbar machen, rot markieren und kurz pausieren."""
    driver.execute_script(
        "arguments[0].scrollIntoView({block:'center'});"
        "arguments[0].style.outline='3px solid red';", link)
    time.sleep(0.5)


# ---------------- Automatisierte Tests mit pytest ----------------

@pytest.fixture(scope="module")
def driver():
    """Einen Browser für die Tests öffnen und auch bei Fehlern wieder schliessen."""
    d = create_browser()
    try:
        yield d
    finally:
        d.quit()


@pytest.mark.parametrize("start", ["Banane", "Schweiz", "Heiliges_Römisches_Reich"])
def test_reaches_philosophy(driver, start):
    """Integrationstest mit echtem Wikipedia: Der Inhalt kann sich verändern."""
    path, status = play(driver, start, show=False)
    assert status == "TARGET", f"{start}: {status} after {len(path)} steps: {path}"


def test_start_at_target(driver):
    """Direkt auf Wikipedia starten: Das Ziel ist nach einem Artikel erreicht."""
    path, status = play(driver, "Philosophie", show=False)
    assert status == "TARGET"
    assert path == ["Philosophie"]


def test_target_ignores_case(driver):
    """Auch ein grossgeschriebenes Zielargument wird online erkannt."""
    path, status = play(driver, "Philosophie", target="PHILOSOPHIE", show=False)
    assert status == "TARGET"
    assert path == ["Philosophie"]


def test_step_limit(driver):
    """Beim Limit bleibt der Browser auf dem letzten erlaubten Wikipedia-Artikel."""
    path, status = play(driver, "Banane", max_steps=1, show=False)
    assert status == "LIMIT"
    assert path == ["Banane"]
    assert driver.current_url == BASE_URL + "Banane"


def test_detects_loop(driver):
    """Den bekannten Online-Zyklus ab Deutsche Sprache erkennen.

    Ein absichtlich unerreichbares Ziel verhindert einen vorzeitigen TARGET-Abbruch.
    Falls Wikipedia den Linkpfad ändert, muss dieser Testartikel angepasst werden.
    """
    path, status = play(driver, "Deutsche Sprache", target="__kein_spielziel__", show=False)
    assert status == "LOOP", f"{status}: {path}"
    assert path[-1] in path[:-1]
    assert len(path[:-1]) == len(set(path[:-1]))


@pytest.mark.parametrize("max_steps", [0, -1])
def test_rejects_invalid_step_limit(max_steps):
    """Ungültige Grenzen ohne Browserzugriff prüfen; keine lokalen Testseiten nötig."""
    with pytest.raises(ValueError, match="mindestens 1"):
        play(None, "Banane", max_steps=max_steps)


def test_no_valid_link(driver):
    """Die echte Statistik-Spezialseite hat keinen auswählbaren Artikellink.

    Hier fehlt der vom Spiel durchsuchte Artikelbereich. Ändert Wikipedia
    die Seitenstruktur, muss diese Online-Testseite angepasst werden.
    """
    path, status = play(driver, "Spezial:Statistik", show=False)
    assert status == "DEAD_END"
    assert path == ["Statistik"]
    assert unquote(urlparse(driver.current_url).path) == "/wiki/Spezial:Statistik"


def test_article_does_not_exist(driver):
    """Einen fehlenden Artikel auf echtem Wikipedia kontrolliert ablehnen."""
    article = "SWT404ErrorNotFound_Testartikel_713862706291660342"
    title = article.replace("_", " ")
    with pytest.raises(ValueError, match=f"Wikipedia-Artikel existiert nicht: {title}"):
        play(driver, article, show=False)
    assert urlparse(driver.current_url).path == "/wiki/" + article


if __name__ == "__main__":
    # Kommandozeilenargumente lesen; ohne Startartikel wird Banane verwendet.
    parser = argparse.ArgumentParser()
    parser.add_argument("start", nargs="?", default="Banane")
    parser.add_argument("--target", default=TARGET)
    parser.add_argument("--steps", type=int, default=MAX_STEPS)
    parser.add_argument("--visualize", action=argparse.BooleanOptionalAction, default=True,
                        help="Jeden ausgewählten Link markieren (standardmässig aktiv)")
    args = parser.parse_args()

    d = create_browser()
    try:
        path, status = play(d, args.start, max_steps=args.steps, target=args.target,
                            show=args.visualize)
        print(f"\nResult: {status} after {len(path)} steps")
    except ValueError as error:
        parser.exit(1, f"Fehler: {error}\n")
    finally:
        # Den Browser auch dann schliessen, wenn beim Spielen ein Fehler auftritt.
        d.quit()
