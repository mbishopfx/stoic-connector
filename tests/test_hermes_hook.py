import importlib.util
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch


SCRIPT = Path(__file__).resolve().parents[1] / "scripts" / "hermes-stoic-hook.py"
spec = importlib.util.spec_from_file_location("hermes_stoic_hook", SCRIPT)
hook = importlib.util.module_from_spec(spec)
spec.loader.exec_module(hook)
PROJECT = "11338f05-93b9-4ad4-9069-b2cad1bcc6b6"


class HermesHookTest(unittest.TestCase):
    def test_only_project_writes_produce_metadata_report(self):
        with tempfile.TemporaryDirectory() as directory, patch.object(hook, "STATE_DIR", Path(directory)):
            calls = []
            common = {"session_id": "session", "extra": {"turn_id": "turn", "status": "success"}}
            hook.handle({**common, "hook_event_name": "post_tool_call", "tool_name": "mcp__stoic_hermes__read_project_board", "tool_input": {"projectId": PROJECT}})
            hook.handle({**common, "hook_event_name": "post_tool_call", "tool_name": "mcp__other__post_project_message", "tool_input": {"projectId": PROJECT}})
            hook.handle({**common, "hook_event_name": "post_tool_call", "tool_name": "mcp__stoic_hermes__post_project_message", "tool_input": {"projectId": PROJECT, "body": "private details"}})
            with patch.object(hook, "post_report", side_effect=lambda *args: calls.append(args) or True):
                hook.handle({**common, "hook_event_name": "on_session_end", "extra": {"turn_id": "turn", "completed": True}})
            self.assertEqual(len(calls), 1)
            self.assertEqual(calls[0][0], PROJECT)
            self.assertNotIn("private details", calls[0][1])
            self.assertEqual(list(Path(directory).glob("*.json")), [])


if __name__ == "__main__":
    unittest.main()
