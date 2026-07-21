import unittest
from server import parse_recipe, ParseError


class ParserTests(unittest.TestCase):
    def test_parses_nested_recipe_json_ld(self):
        page = '''<script type="application/ld+json">{
          "@context":"https://schema.org", "@graph":[{"@type":"Recipe",
          "name":"Toast", "totalTime":"PT1H5M", "recipeYield":"Serves 2",
          "image":{"url":"/toast.jpg"}, "publisher":{"name":"Test Kitchen"},
          "recipeIngredient":["2 slices bread", "1 tbsp butter"],
          "recipeInstructions":[{"@type":"HowToStep","text":"Toast the bread."},
          {"@type":"HowToSection","itemListElement":[{"text":"Add butter."}]}]}]}</script>'''
        result = parse_recipe(page, "https://example.com/recipes/toast")
        self.assertEqual(result["title"], "Toast")
        self.assertEqual(result["time"], "1 hr 5 min")
        self.assertEqual(result["servings"], 2)
        self.assertEqual(result["image"], "https://example.com/toast.jpg")
        self.assertEqual(result["ingredients"][0], ["2", "slices bread"])
        self.assertEqual(result["steps"], ["Toast the bread.", "Add butter."])

    def test_rejects_page_without_recipe(self):
        with self.assertRaises(ParseError):
            parse_recipe("<html><h1>Blog</h1></html>", "https://example.com")


if __name__ == "__main__":
    unittest.main()
