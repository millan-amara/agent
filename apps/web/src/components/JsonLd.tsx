/**
 * Renders one or more schema.org nodes as a JSON-LD <script>. Pass a single node
 * or an array; arrays are wrapped in an "@graph" so nodes can cross-reference by
 * "@id". The "@context" is added here so callers never repeat it.
 *
 * JSON.stringify output is safe inside a <script type="application/ld+json"> tag;
 * the only character that could break out is "<", which we escape.
 */
export function JsonLd({ schema }: { schema: object | object[] }) {
  const payload = Array.isArray(schema)
    ? { "@context": "https://schema.org", "@graph": schema }
    : { "@context": "https://schema.org", ...schema };

  const json = JSON.stringify(payload).replace(/</g, "\\u003c");

  return (
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: json }} />
  );
}
