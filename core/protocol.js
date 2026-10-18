import sodium from 'libsodium-wrappers';
import {createHash} from 'node:crypto';
export const ready = sodium.ready;
export const encode = x => sodium.to_base64(x, sodium.base64_variants.ORIGINAL);
export const decode = x => sodium.from_base64(x, sodium.base64_variants.ORIGINAL);
export const canonical = x => JSON.stringify(x);
export function userId(key) { return createHash('sha256').update(decode(key)).digest('hex'); }
export function identity() { const k = sodium.crypto_sign_keypair(); return {publicKey:encode(k.publicKey),privateKey:encode(k.privateKey)}; }
export function card(identity) { return {v:1,id:userId(identity.publicKey),publicKey:identity.publicKey}; }
export function validateCard(c) { if(c?.v!==1 || decode(c.publicKey).length!==32 || c.id!==userId(c.publicKey)) throw Error('Invalid contact card'); return {v:1,id:c.id,publicKey:c.publicKey}; }
export function sign(value, identity) { return encode(sodium.crypto_sign_detached(canonical(value),decode(identity.privateKey))); }
export function verify(value,signature,key) { try { return sodium.crypto_sign_verify_detached(decode(signature),canonical(value),decode(key)); } catch { return false; } }
export function challenge(scope,nonce) { return {v:1,type:'authentication',scope,nonce}; }
export function seal(payload, identity, recipient) {
 const nonce=sodium.randombytes_buf(24);
 const cipher=sodium.crypto_box_easy(canonical(payload),nonce,sodium.crypto_sign_ed25519_pk_to_curve25519(decode(recipient.publicKey)),sodium.crypto_sign_ed25519_sk_to_curve25519(decode(identity.privateKey)));
 const body={v:1,from:payload.from,to:payload.to,id:payload.id,nonce:encode(nonce),cipher:encode(cipher)};
 return {...body,signature:sign(body,identity)};
}
export function envelopeBody(e) { return {v:e.v,from:e.from,to:e.to,id:e.id,nonce:e.nonce,cipher:e.cipher}; }
export function open(e,identity,sender) {
 if(e.v!==1 || !verify(envelopeBody(e),e.signature,sender.publicKey)) throw Error('Invalid signature');
 const p=JSON.parse(sodium.crypto_box_open_easy(decode(e.cipher),decode(e.nonce),sodium.crypto_sign_ed25519_pk_to_curve25519(decode(sender.publicKey)),sodium.crypto_sign_ed25519_sk_to_curve25519(decode(identity.privateKey)),'text'));
 if(p.v!==1 || p.from!==sender.id || p.from!==e.from || p.to!==e.to || p.id!==e.id || p.to!==card(identity).id || !['message','ack'].includes(p.type)) throw Error('Invalid authenticated headers');
 return p;
}
