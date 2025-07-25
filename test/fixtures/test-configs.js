/**
 * Test configuration fixtures for comprehensive testing
 */

const validConfigs = {
  single: [
    {
      url: "https://example.com",
      css_selector: "#test",
      current_value: "test value",
    },
  ],

  multiple: [
    {
      url: "https://example.com/product1",
      css_selector: "#price",
      current_value: "$19.99",
    },
    {
      url: "https://example.com/product2",
      css_selector: ".title",
      current_value: "Product Name",
    },
    {
      url: "https://test-site.com/status",
      css_selector: "[data-status]",
      current_value: "Available",
    },
  ],

  large: Array.from({ length: 50 }, (_, i) => ({
    url: `https://example.com/product${i + 1}`,
    css_selector: `#price${i + 1}`,
    current_value: `$${(Math.random() * 100).toFixed(2)}`,
  })),

  withSpecialSelectors: [
    {
      url: "https://example.com/complex",
      css_selector: "div.container > .price:nth-child(2)",
      current_value: "$29.99",
    },
    {
      url: "https://example.com/attributes",
      css_selector: "[data-testid='product-price']",
      current_value: "$39.99",
    },
    {
      url: "https://example.com/pseudo",
      css_selector: "li:first-child .text",
      current_value: "First Item",
    },
  ],
};

const invalidConfigs = {
  missingUrl: [
    {
      css_selector: "#test",
      current_value: "test value",
    },
  ],

  missingSelector: [
    {
      url: "https://example.com",
      current_value: "test value",
    },
  ],

  missingCurrentValue: [
    {
      url: "https://example.com",
      css_selector: "#test",
    },
  ],

  invalidUrl: [
    {
      url: "not-a-valid-url",
      css_selector: "#test",
      current_value: "test value",
    },
  ],

  invalidSelector: [
    {
      url: "https://example.com",
      css_selector: "invalid>>selector",
      current_value: "test value",
    },
  ],

  emptyArray: [],

  notArray: {
    url: "https://example.com",
    css_selector: "#test",
    current_value: "test value",
  },
};

const mockWebPages = {
  simple: `
    <!DOCTYPE html>
    <html>
      <head><title>Test Page</title></head>
      <body>
        <div id="test">test value</div>
        <div id="price">$19.99</div>
        <div class="title">Product Name</div>
        <div data-status="Available">Available</div>
      </body>
    </html>
  `,

  changed: `
    <!DOCTYPE html>
    <html>
      <head><title>Test Page</title></head>
      <body>
        <div id="test">new test value</div>
        <div id="price">$18.99</div>
        <div class="title">New Product Name</div>
        <div data-status="Out of Stock">Out of Stock</div>
      </body>
    </html>
  `,

  complex: `
    <!DOCTYPE html>
    <html>
      <head><title>Complex Test Page</title></head>
      <body>
        <div class="container">
          <div class="price">$19.99</div>
          <div class="price">$29.99</div>
          <div class="price">$39.99</div>
        </div>
        <div data-testid="product-price">$39.99</div>
        <ul>
          <li><span class="text">First Item</span></li>
          <li><span class="text">Second Item</span></li>
        </ul>
      </body>
    </html>
  `,

  delayed: `
    <!DOCTYPE html>
    <html>
      <head><title>Delayed Content</title></head>
      <body>
        <div id="initial">Initial content</div>
        <script>
          setTimeout(() => {
            const div = document.createElement('div');
            div.id = 'delayed';
            div.textContent = 'Delayed content';
            document.body.appendChild(div);
          }, 500);
        </script>
      </body>
    </html>
  `,

  missing: `
    <!DOCTYPE html>
    <html>
      <head><title>Missing Elements</title></head>
      <body>
        <div id="other">Other content</div>
      </body>
    </html>
  `,

  error: `
    <!DOCTYPE html>
    <html>
      <head><title>Error Page</title></head>
      <body>
        <script>
          // Simulate JavaScript error
          throw new Error('Page script error');
        </script>
        <div id="test">Error page content</div>
      </body>
    </html>
  `,
};

module.exports = {
  validConfigs,
  invalidConfigs,
  mockWebPages,
};
