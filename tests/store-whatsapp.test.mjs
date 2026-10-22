import {test} from 'node:test';
import assert from 'node:assert/strict';
import {storeWhatsappUrl,parseStoreWhatsappUrl} from '../src/lib/store-whatsapp.ts';
test('preserves accents, spaces, emojis and query punctuation in a single text parameter',()=>{
 const text="e quero a promoção & desconto de 10% 🎉 + brinde #1";
 const url=storeWhatsappUrl('553499483549','Olá vim pelo app SOS MARCENEIROS',text);
 assert.equal(new URL(url).searchParams.get('text'),'Olá vim pelo app SOS MARCENEIROS '+text);
 assert.equal([...new URL(url).searchParams].length,1);
 assert.deepEqual(parseStoreWhatsappUrl(storeWhatsappUrl('553499483549','Olá')), {phone:'553499483549',intro:'Olá'});
});
test('rejects alternate hosts, extra parameters and missing phones/messages',()=>{
 for(const url of ['https://wa.me.evil.com/553499483549?text=oi','https://wa.me/553499483549?text=oi&text=override','http://wa.me/553499483549?text=oi','https://wa.me/abc?text=oi','https://wa.me/553499483549']) assert.throws(()=>parseStoreWhatsappUrl(url));
});
