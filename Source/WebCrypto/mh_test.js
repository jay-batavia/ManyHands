function test01()
{
    var alice;
    var bob;
    var team_id_hack;
    var step1_pub;
    register( 'alice', 'p' )
    .then( function( _ ) {
        return register( 'bob', 'p' );
    } ).then( function( _ ) {
        return login( 'alice', 'p' );
    } ).then( function( u ) {
        alice = u;
        return login( 'bob', 'p' );
    } ).then( function( u ) {
        bob = u;
        return createTeam( 'ATeam', alice );
    } ).then( function( team_id ) {
        team_id_hack = team_id;
        return login( 'alice', 'p' );
    } ).then( function( u ) {
        alice = u;
        return inviteStep1( 'bob', team_id_hack, alice );
    } ).then( function( s ) {
        step1_pub = s;
        return inviteStep2( step1_pub, bob );
    } ).then( function( accept ) {
        return inviteStep3( accept, alice );
    } ).then( function() {
        return inviteStep4( step1_pub, bob );
    } ).then( function( blah ) {
        log( 'Finally', blah );
    } )
}
