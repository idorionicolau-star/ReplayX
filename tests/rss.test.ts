import { describe, expect, it } from 'vitest';
import { parseFeed, stripHtml } from '@/server/rss';

const RSS = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:media="http://search.yahoo.com/mrss/">
<channel><title>FX</title>
<item><title>EUR/USD sobe após dados do BCE</title><link>https://ex.com/a</link><pubDate>Mon, 13 May 2024 08:30:00 GMT</pubDate>
<description><![CDATA[<p>O <b>euro</b> ganhou terreno &amp; mais.</p>]]></description><media:content url="https://ex.com/img.jpg" /></item>
<item><title>Ouro recua</title><link>https://ex.com/b</link><pubDate>Mon, 13 May 2024 09:00:00 GMT</pubDate></item>
</channel></rss>`;

const ATOM = `<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom"><title>Cripto</title>
<entry><title>Bitcoin acima de 70 mil</title><link rel="alternate" href="https://ex.com/btc"/><updated>2024-05-13T10:00:00Z</updated><summary>Resumo</summary></entry>
</feed>`;

describe('leitor de RSS', () => {
  it('lê RSS 2.0 com imagens e HTML', () => {
    const items = parseFeed(RSS, 'FXStreet', 'forex');
    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({ title: 'EUR/USD sobe após dados do BCE', link: 'https://ex.com/a', source: 'FXStreet', image: 'https://ex.com/img.jpg' });
    expect(items[0].summary).toBe('O euro ganhou terreno & mais.');
    expect(items[0].time).toBe(Date.parse('2024-05-13T08:30:00Z') / 1000);
  });

  it('lê Atom', () => {
    const items = parseFeed(ATOM, 'CoinDesk', 'crypto');
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ title: 'Bitcoin acima de 70 mil', link: 'https://ex.com/btc', summary: 'Resumo' });
  });

  it('remove HTML e entidades', () => {
    expect(stripHtml('<div>a&nbsp;<b>b</b> &lt;c&gt;</div>')).toBe('a b <c>');
  });
});
