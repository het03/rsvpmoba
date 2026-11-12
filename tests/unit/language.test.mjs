import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { detectLanguage } from '../../src/lib/language.ts';

describe('detectLanguage', () => {
  const samples = {
    en: 'The cat was not in the house, but she had the dog and the children with her.',
    de: 'Die Katze ist nicht in dem Haus, aber der Hund und die Kinder sind auch da.',
    fr: "Le chat est dans la maison, mais il n'est pas avec les enfants et le chien.",
    es: 'El gato no está en la casa, pero los niños y el perro están con una amiga de su madre.',
    it: 'Il gatto non è nella casa, ma i bambini e il cane sono con una amica della madre.',
    pt: 'O gato não está na casa, mas os meninos e o cachorro estão com uma amiga da mãe.',
    nl: 'De kat is niet in het huis, maar de kinderen en de hond zijn er ook met een vriend.',
  };

  for (const [code, text] of Object.entries(samples)) {
    test(`recognises ${code}`, () => {
      assert.equal(detectLanguage(text), code);
    });
  }

  test('too little text to tell gives null', () => {
    assert.equal(detectLanguage('Haus'), null);
    assert.equal(detectLanguage('Er sagte nichts.'), null);
    assert.equal(detectLanguage(''), null);
    assert.equal(detectLanguage('   '), null);
    assert.equal(detectLanguage('123 456'), null);
  });

  test('text without common words gives null instead of a guess', () => {
    assert.equal(detectLanguage('Serendipity quixotic labyrinth ephemeral'), null);
  });

  test('capitalisation and punctuation do not matter', () => {
    assert.equal(detectLanguage('DIE KATZE IST NICHT IN DEM HAUS, ABER DER HUND UND DIE KINDER!'), 'de');
  });

  test('a passage split evenly between two languages gives null', () => {
    const mixed = 'the and of to in that is the and of to in that is der die das und nicht ist ein eine ich sie er';
    assert.equal(detectLanguage(mixed), null);
  });

  test('a quoted foreign phrase in a mostly English paragraph does not change the answer', () => {
    const text = 'He said that it was the end of the day and she had not gone with him, "Ich weiß nicht", he said to her.';
    assert.equal(detectLanguage(text), 'en');
  });
});
