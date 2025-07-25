const ChangeDetector = require("./change-detector");

describe("ChangeDetector", () => {
  let changeDetector;

  beforeEach(() => {
    changeDetector = new ChangeDetector();
  });

  describe("detectChange", () => {
    test("should return false when values are identical", () => {
      const result = changeDetector.detectChange("same value", "same value");
      expect(result).toBe(false);
    });

    test("should return true when values are different", () => {
      const result = changeDetector.detectChange("new value", "old value");
      expect(result).toBe(true);
    });

    test("should handle whitespace differences by trimming", () => {
      const result = changeDetector.detectChange("  value  ", "value");
      expect(result).toBe(false);
    });

    test("should detect changes with whitespace variations", () => {
      const result = changeDetector.detectChange(
        "  new value  ",
        "  old value  "
      );
      expect(result).toBe(true);
    });

    test("should handle null values correctly", () => {
      expect(changeDetector.detectChange(null, null)).toBe(false);
      expect(changeDetector.detectChange(null, "value")).toBe(true);
      expect(changeDetector.detectChange("value", null)).toBe(true);
    });

    test("should handle undefined values correctly", () => {
      expect(changeDetector.detectChange(undefined, undefined)).toBe(false);
      expect(changeDetector.detectChange(undefined, "value")).toBe(true);
      expect(changeDetector.detectChange("value", undefined)).toBe(true);
    });

    test("should convert non-string values to strings", () => {
      expect(changeDetector.detectChange(123, "123")).toBe(false);
      expect(changeDetector.detectChange(123, "456")).toBe(true);
      expect(changeDetector.detectChange(true, "true")).toBe(false);
    });

    test("should handle empty strings", () => {
      expect(changeDetector.detectChange("", "")).toBe(false);
      expect(changeDetector.detectChange("", "value")).toBe(true);
      expect(changeDetector.detectChange("value", "")).toBe(true);
    });
  });

  describe("createChangeRecord", () => {
    test("should create proper change record structure", () => {
      const entry = {
        url: "https://example.com",
        css_selector: "#price",
        current_value: "$19.99",
      };

      const record = changeDetector.createChangeRecord(
        entry,
        "$19.99",
        "$18.49"
      );

      expect(record).toMatchObject({
        url: "https://example.com",
        css_selector: "#price",
        old_value: "$19.99",
        new_value: "$18.49",
        entry: entry,
        hasChanged: true,
      });

      expect(record.timestamp).toMatch(
        /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/
      );
      expect(record.detected_at).toBeInstanceOf(Date);
    });

    test("should handle null/undefined values in change record", () => {
      const entry = {
        url: "https://example.com",
        css_selector: "#content",
        current_value: null,
      };

      const record = changeDetector.createChangeRecord(
        entry,
        null,
        "new content"
      );

      expect(record.old_value).toBeNull();
      expect(record.new_value).toBe("new content");
    });

    test("should preserve original entry reference", () => {
      const entry = {
        url: "https://example.com",
        css_selector: "#test",
        current_value: "old",
      };

      const record = changeDetector.createChangeRecord(entry, "old", "new");

      expect(record.entry).toBe(entry);
    });
  });

  describe("processEntry", () => {
    test("should return change record when values differ", () => {
      const entry = {
        url: "https://example.com",
        css_selector: "#price",
        current_value: "$19.99",
      };

      const result = changeDetector.processEntry(entry, "$18.49");

      expect(result.hasChanged).toBe(true);
      expect(result.old_value).toBe("$19.99");
      expect(result.new_value).toBe("$18.49");
      expect(result.url).toBe("https://example.com");
      expect(result.css_selector).toBe("#price");
    });

    test("should return no-change result when values are same", () => {
      const entry = {
        url: "https://example.com",
        css_selector: "#price",
        current_value: "$19.99",
      };

      const result = changeDetector.processEntry(entry, "$19.99");

      expect(result.hasChanged).toBe(false);
      expect(result.oldValue).toBe("$19.99");
      expect(result.newValue).toBe("$19.99");
      expect(result.entry).toBe(entry);
      expect(result.timestamp).toMatch(
        /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/
      );
    });

    test("should handle whitespace in processEntry", () => {
      const entry = {
        url: "https://example.com",
        css_selector: "#content",
        current_value: "content",
      };

      const result = changeDetector.processEntry(entry, "  content  ");

      expect(result.hasChanged).toBe(false);
    });

    test("should detect changes with different whitespace", () => {
      const entry = {
        url: "https://example.com",
        css_selector: "#content",
        current_value: "old content",
      };

      const result = changeDetector.processEntry(entry, "  new content  ");

      expect(result.hasChanged).toBe(true);
      expect(result.old_value).toBe("old content");
      expect(result.new_value).toBe("  new content  ");
    });
  });

  describe("edge cases", () => {
    test("should handle very long strings", () => {
      const longString1 = "a".repeat(10000);
      const longString2 = "b".repeat(10000);

      expect(changeDetector.detectChange(longString1, longString1)).toBe(false);
      expect(changeDetector.detectChange(longString1, longString2)).toBe(true);
    });

    test("should handle special characters", () => {
      const special1 = "!@#$%^&*()_+-=[]{}|;:,.<>?";
      const special2 = "!@#$%^&*()_+-=[]{}|;:,.<>!";

      expect(changeDetector.detectChange(special1, special1)).toBe(false);
      expect(changeDetector.detectChange(special1, special2)).toBe(true);
    });

    test("should handle unicode characters", () => {
      const unicode1 = "🔔 Change Detected! 价格: ¥123.45";
      const unicode2 = "🔔 Change Detected! 价格: ¥124.45";

      expect(changeDetector.detectChange(unicode1, unicode1)).toBe(false);
      expect(changeDetector.detectChange(unicode1, unicode2)).toBe(true);
    });

    test("should handle newlines and tabs", () => {
      const multiline1 = "line1\nline2\tindented";
      const multiline2 = "line1\nline2\tindented";
      const multiline3 = "line1\nline3\tindented";

      expect(changeDetector.detectChange(multiline1, multiline2)).toBe(false);
      expect(changeDetector.detectChange(multiline1, multiline3)).toBe(true);
    });
  });
});
