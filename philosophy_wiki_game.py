""".
Setup:  uv sync
Run:    python philosophy_wiki_game.py [start_article] [--target WORD] [--steps N]
Test:   pytest philosophy_wiki_game.py -v
(Selenium >= 4.6 downloads the matching browser driver automatically.)
"""
import argparse
import os
import time
from urllib.parse import quote

import pytest
from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.support import expected_conditions as EC
from selenium.webdriver.support.ui import WebDriverWait

BASE_URL = "https://de.wikipedia.org/wiki/"
TARGET = "philosophie"
MAX_STEPS = 50

_JS_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "first_link.js")
with open(_JS_PATH, encoding="utf-8") as _f:
    FIRST_LINK_JS = _f.read()


def create_browser():
    return webdriver.Chrome()


def current_title(driver):
    heading = WebDriverWait(driver, 10).until(
        EC.presence_of_element_located((By.ID, "firstHeading"))
    )
    return heading.text.strip()


def play(driver, start_article, max_steps=MAX_STEPS, target=TARGET):
    """Returns (path, status). status: TARGET | LOOP | DEAD_END | LIMIT"""
    driver.get(BASE_URL + quote(start_article.replace(" ", "_")))
    path, visited = [], set()

    for step in range(1, max_steps + 1):
        title = current_title(driver)
        path.append(title)
        print(f"{step:>2}. {title}")

        if target in title.lower():
            return path, "TARGET"
        if title in visited:
            return path, "LOOP"
        visited.add(title)

        link = driver.execute_script(FIRST_LINK_JS)
        if link is None:
            return path, "DEAD_END"

        # Highlight the link and wait a short time for the demo.
        driver.execute_script(
            "arguments[0].scrollIntoView({block:'center'});"
            "arguments[0].style.outline='3px solid red';", link)
        time.sleep(0.5) # REMOVE for more performance
        driver.get(link.get_attribute("href"))

    return path, "LIMIT"


# ---------------- pytest ----------------

@pytest.fixture
def driver():
    d = create_browser()
    yield d
    d.quit()


@pytest.mark.parametrize("start", ["Banane", "Schweiz", "Heiliges_Römisches_Reich"])
def test_reaches_philosophy(driver, start):
    path, status = play(driver, start)
    assert status == "TARGET", f"{start}: {status} after {len(path)} steps: {path}"

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("start", nargs="?", default="Banane")
    parser.add_argument("--target", default=TARGET)
    parser.add_argument("--steps", type=int, default=MAX_STEPS)
    args = parser.parse_args()

    d = create_browser()
    try:
        path, status = play(d, args.start, max_steps=args.steps, target=args.target)
        print(f"\nResult: {status} after {len(path)} steps")
    finally:
        d.quit()