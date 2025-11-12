import random
import re
from datetime import datetime


class SimpleBot:
    def __init__(self, user_name: str | None = None):
        self.user_name = user_name

    def reply(self, user_text: str) -> str:
        t = user_text.strip().lower()
        if not t:
            return "Say something and I'll answer."
        if any(g in t for g in ["hi", "hello", "hey"]):
            return random.choice(["Hello!", "Hi there!", "Hey! How can I help?"])
        if "your name" in t:
            return "I'm your 3D avatar."
        if "time" in t:
            return f"It's {datetime.now().strftime('%I:%M %p')}."
        m = re.search(r"my name is ([a-zA-Z]+)", t)
        if m:
            self.user_name = m.group(1).title()
            return f"Nice to meet you, {self.user_name}!"
        if "joke" in t:
            return random.choice(
                [
                    "Why do programmers prefer dark mode? Because light attracts bugs.",
                    "I would tell you a UDP joke, but you might not get it.",
                    "There are 10 kinds of people: those who understand binary and those who don't.",
                ]
            )
        if t in ["bye", "exit", "quit"]:
            return "Goodbye!"
        # default
        if self.user_name:
            return f"{self.user_name}, I heard you say: {user_text}"
        return f"You said: {user_text}"

