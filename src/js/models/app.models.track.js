App.module('Models', function( Models, App, Backbone, Marionette, $, _ ) {

  var Track = Models.Track = Backbone.Model.extend({

    defaults: {
      name   : 'Track',
      gain   : 1, // 0 - 1 (1 being loudest)
      pan    : 0, // -1 - 1 (left to right)
      muted  : false,
      _muted : false,
      soloed : false,
      rms    : -48,
      afl    : true
    },

    initialize: function() {
      this.nodes = {};
      this.createNodes();
      this.setValues();
      this.fetchAudio();
      this.fftSize = 2048;
      this.timeData = new Uint8Array(this.fftSize);
      this.on('change:gain', this.setGain, this);
      this.on('change:pan', this.setPanning, this);
    },

    // create gain/pan/mute/solo nodes
    createNodes: function() {
      // user mute
      this.nodes.mute = App.ac.createGain();
      // auto mute (caused by other tracks being soloed)
      this.nodes._mute = App.ac.createGain();
      // left channel gain
      this.nodes.panLeft = App.ac.createGain();
      // right channel gain
      this.nodes.panRight = App.ac.createGain();
      // channel merger
      this.nodes.merger = App.ac.createChannelMerger(2);
      // analyser
      this.nodes.analyser = App.ac.createAnalyser();
      // track gain
      this.nodes.gain = App.ac.createGain();
      // make connections
      this.nodes._mute.connect(this.nodes.mute);
      this.nodes.mute.connect(this.nodes.panLeft);
      this.nodes.mute.connect(this.nodes.panRight);
      this.nodes.panLeft.connect(this.nodes.merger, 0, 0);
      this.nodes.panRight.connect(this.nodes.merger, 0, 1);
      this.nodes.merger.connect(this.nodes.analyser);
      this.nodes.merger.connect(this.nodes.gain);
      this.nodes.gain.connect(App.mix.nodes.gain);
      this.nodes.analyser.smoothingTimeConstant = 1;
      return this;
    },

    // set track params
    setValues: function() {
      this.setGain();
      this.setPanning();
      if ( this.get('muted') ) {
        this.mute();
      }
      if ( this.get('_muted') ) {
        this._mute();
      }
      if ( this.get('soloed') ) {
        this.solo();
      }
      return this;
    },

    // set gain
    setGain: function() {
      this.nodes.gain.gain.value = this.get('gain');
      return this;
    },

    // set panning
    setPanning: function() {
      this.nodes.panLeft.gain.value = ( this.get('pan') * -0.5 ) + 0.5;
      this.nodes.panRight.gain.value = ( this.get('pan') * 0.5 ) + 0.5;
      return this;
    },

    // fetch audio assets, then trigger a 'loaded' event on the app
    fetchAudio: function() {
      App.util.fetchAudioAsset(this.get('path'), function( buffer ) {
        this.buffer = buffer;
        App.vent.trigger('loaded');
      }.bind(this));
      return this;
    },

    // create a new bufferSource and connect it
    connect: function() {
      this.nodes.source = App.util.createBufferSource(this.buffer);
      this.nodes.source.connect(this.nodes._mute);
      return this;
    },

    // start playback
    play: function() {
      this.pause().connect();
      this.nodes.source.start(App.ac.currentTime, App.mix.exactTime());
      return this;
    },

    // pause playback
    pause: function() {
      if ( this.nodes.source ) {
        this.nodes.source.stop(0);
      }
      return this;
    },

    // mute the track (user-initiated)
    mute: function() {
      this.nodes.mute.gain.value = 0;
      this.set('muted', true);
      if ( this.get('soloed') ) {
        this.unsolo();
      }
      return this;
    },

    // unmute the track (user-initiated)
    unmute: function(){
      this.nodes.mute.gain.value = 1;
      this.set('muted', false);
      return this;
    },

    // mute the track (initiated by mix.soloMute)
    _mute: function(){
      this.nodes._mute.gain.value = 0;
      this.set('_muted', true);
      return this;
    },

    // unmute the track (initiated by mix.soloMute)
    _unmute: function(){
      this.nodes._mute.gain.value = 1;
      this.set('_muted', false);
      return this;
    },

    // solo the track
    solo: function(){
      this.unmute();
      this._unmute();
      this.set('soloed', true);
      App.vent.trigger('solo');
      return this;
    },

    // unsolo the track
    unsolo: function(){
      this.set('soloed', false);
      App.vent.trigger('unsolo');
      return this;
    },

    levels: function( e ) {
      var floats;
      this.nodes.analyser.getByteTimeDomainData(this.timeData);
      floats = Array.prototype.map.call(this.timeData, function( val ) {
        return App.util.scale(val, 0, 255, -1, 1);
      });
      floats = App.util.rms(floats);
      this.set('rms', App.mix.get('playing') ? floats : this.get('rms') - 0.8);
      return this;
    },

    toJSON: function() {
      var out = _.extend({}, this.attributes);
      delete out.rms;
      return out;
    }

  });

});