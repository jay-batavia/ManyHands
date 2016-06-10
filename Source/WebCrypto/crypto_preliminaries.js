var SALT_NUM_BYTES = 128;
var SIG_LENGTH = 132;
var PBKDF2_ITER = 1000;

var signing_kalgo = { name: 'ECDSA', namedCurve: 'P-521' };
var signing_salgo = { name: 'ECDSA', hash: { name:'SHA-256' } };
var pub_enc_algo  = { name: 'ECDH', namedCurve: 'P-521' };
var sym_enc_algo  = { name: 'AES-CBC', length: 256  };

function pbkdf_algo( salt )
{ return { name: 'PBKDF2', salt: salt, iterations: 1000, hash: { name: 'SHA-1' } }; }


/* TODO: zeros is used as the IV in too many encryptions. */
var zeros = new Uint8Array( 16 );

function importKeyEncrypt( k )
{ return C.importKey( 'jwk', JSON.parse( k ),  pub_enc_algo, true, [] ); }
function importKeyDecrypt( k )
{ return C.importKey( 'jwk', JSON.parse( k ),  pub_enc_algo, true, [ 'deriveKey' ] ); }
function importKeyVerify( k )
{ return C.importKey( 'jwk', JSON.parse( k ), signing_kalgo, true, [ 'verify' ] ); }
function importKeySign( k )
{ return C.importKey( 'jwk', JSON.parse( k ), signing_kalgo, true, [ 'sign' ] ); }
function importKeySym( k )
{ return C.importKey( 'jwk', JSON.parse( k ),  sym_enc_algo, true, [ 'encrypt', 'decrypt' ] ); }

/* Encode and pack strings into a byte array */
function stringsToBuf( strings )
{
    /* assert( Array.isArray( strings ) ) */
    /* assert( forall i. typeof( strings[i] ) == 'string' ) */
    var bufs = [];
    var total_bytes = 0;
    for( var i = 0; i < strings.length; i++ )
    {
        bufs.push( encode( strings[ i ] ) );
        total_bytes += bufs[ i ].length;
    }
    var b = new Uint8Array( total_bytes );
    var byte_ptr = 0;
    for( var i = 0; i < bufs.length; i++ )
    {
        b.set( bufs[i], byte_ptr );
        byte_ptr += bufs[i];
    }
    return b;
}

function makeLoginKeys( username, password, salt )
{
    /* assert( typeof( username ) == 'string' ) */
    /* assert( typeof( password ) == 'string' ) */
    /* assert( typeof( salt ) == typed array ) */
    salt = new Uint8Array( salt );
    var salt1 = salt.subarray( salt.byteLength / 2 );
    var salt2 = salt.subarray( 0, salt.byteLength / 2 );
    var up = stringsToBuf( [ username, password ] );
    return C.importKey( 'raw', up, { name: 'PBKDF2' }, true, [ 'deriveKey' ]
    ).then( function( k ) {
        return P.all( [ C.deriveKey( pbkdf_algo( salt1 ), k, sym_enc_algo,
                                     true, [ 'encrypt', 'decrypt' ] ),
                        C.deriveKey( pbkdf_algo( salt2 ), k,
                                     { name:'HMAC', hash: { name: 'SHA-256' } },
                                     true, [ 'sign', 'verify' ] ) ] );
    } );
}

function CryptoSpecificAlgos( enc_algo, sign_algo )
{
    this.enc_algo   = enc_algo;
    this.sign_algo  = sign_algo;
    this.sig_length = SIG_LENGTH;
    this.iv_length  = 16;
}

CryptoSpecificAlgos.prototype.encrypt_then_sign =
function( e_key, s_key, data, enc_param )
{
    /* log( '[Debug]', data ); */
    return C.encrypt( this.enc_algo( enc_param ), e_key, data )
    .then( function( data_enc ) {
        return P.all( [ C.sign( s_algo, s_key, data_enc ), P.resolve( data_enc ) ] );
    } ).then( function( [ sig, data_enc ] ) {
        log( 'Signature length:', sig.byteLength );
        return P.resolve( typedArrayConcat( sig, data_enc ) );
    } ).catch( domToCrypto );
}

CryptoSpecificAlgos.prototype.verify_then_decrypt =
function( e_key, s_key, sig_plus_data, enc_param )
{
    /* log( '[Debug]', ... )*/
    var d_as_bytes = new Uint8Array( sig_plus_data );
    var sig = d_as_bytes.subarray( 0, this.sig_length );
    var data_enc = d_as_bytes.subarray( this.sig_length );
    return C.verify( this.sign_algo, s_key, sig, data_enc )
    .then( function( signature_ok ) {
        if( !signature_ok )
            return P.reject( new VerificationError() );
        /* 'else' */
        return C.decrypt( this.enc_algo( enc_param ), e_key, data_enc );
    } ).catch( domToCrypto );
}

CryptoSpecificAlgos.prototype.encrypt_then_sign_salted =
function( e_key, s_key, data )
{
    return this.encrypt_then_sign(
        e_key, s_key, typedArrayConcat( getRandomBytes( this.iv_length ), data ), zeros );
}

CryptoSpecificAlgos.prototype.verify_then_decrypt_salted =
function( e_key, s_key, data )
{
    return this.verify_then_decrypt( e_key, s_key, data, zeros )
    .then( function( salt_plus_data ) {
        return P.resolve( salt_plus_data.subarray( this.iv_length ) );
    } );
}

var aes_cbc_ecdsa = new CryptoSpecificAlgos(
    function( iv ) { return { name: 'AES-CBC', iv: iv }; },
    function()     { return { name: 'ECDSA', hash: { name:'SHA-256' } }; }
);

var aes_cbc_hmac = new CryptoSpecificAlgos(
    function( iv ) { return { name: 'AES-CBC', iv: iv }; },
    function()     { return { name: 'HMAC' }; }
);
