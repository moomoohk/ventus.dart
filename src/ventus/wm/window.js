/**
 * Ventus
 * Copyright © 2012 Ramón Lamana
 * https://github.com/rlamana
 */
define([
	'ventus/core/emitter',
	'ventus/core/promise',
	'ventus/core/view',
	'ventus/tpl/window'
],
function(Emitter, Promise, View, WindowTemplate) {
	'use strict';

	function isTouchEvent(e) {
		return !!window.TouchEvent && (e.originalEvent instanceof window.TouchEvent);
	}

	function convertMoveEvent(e) {
		return isTouchEvent(e) ? e.originalEvent.changedTouches[0] : e.originalEvent;
	}

	var Window = function (options) {
		this.signals = new Emitter();

		options = options || {
			title: 'Untitle Window',
			width: 400,
			height: 200,
			x: 0,
			y: 0,
			content: '',

			movable: true,
			closable: true,
			resizable: true,
			widget: false,
			titlebar: true
		};

		// View
		this.el = View(WindowTemplate({
			title: options.title,
			classname: options.classname||''
		}));
		this.el.listen(this.events.window, this);

		if(options.opacity) {
			this.el.css('opacity', options.opacity);
		}

		// Predefined signal/events handlers
		if(options.events) {
			for(var eventName in options.events) {
				if(options.events.hasOwnProperty(eventName) &&
				   typeof options.events[eventName] === 'function') {
					this.signals.on(eventName, options.events[eventName], this);
				}
			}
		}

		// Cache content element
		this.$content = this.el.find('.wm-content');
		if(options.content) {
			this.$content.append(options.content);
		}

		// Cache header element
		this.$titlebar = this.el.find('header');

		this.width = options.width || 400;
		this.height = options.height || 200;

		this.x = options.x || 0;
		this.y = options.y || 0;
		this.z = 10000;

		// State
		this.enabled = true;
		this.active = false;
		this.maximized = false;
		this.minimized = false;

		this._closed = true;
		this._destroyed = false;

		// Properties
		this.widget = false;
		this.closable = (typeof options.closable !== 'undefined') ? options.closable : true;
		this.movable = true;
		this.resizable = (typeof options.resizable !== 'undefined') ?
			options.resizable :
			true;

		this.titlebar = true;
	};

	Window.prototype = {
		_restore: null,
		_moving: null,
		_resizing: null,

		slots: {
			move: function(e) {
				var event = convertMoveEvent(e);

				if(!this.enabled || !this.movable) {
					return;
				}

				this._moving = this.toLocal({
					x: event.pageX,
					y: event.pageY
				});

				this.el.addClass('move');

				e.preventDefault();
			}
		},

		events: {
			window: {
				'click': function(e) {
					this.signals.emit('select', this, e);
				},

				'mousedown': function(e) {
					this.focus();

					if(this.widget) {
						this.slots.move.call(this, e);
					}
				},

				'.wm-content click': function(e) {
					if(this.enabled) {
						this.signals.emit('click', this, e);
					}
				},

				'.wm-window-title mousedown': function(e) {
					if (!this.maximized) {
                        this.slots.move.call(this, e);
                    }
				},

				'.wm-window-title dblclick': function() {
					if(this.enabled && this.resizable) {
						this.maximize();
					}
				},

				'.wm-window-title button.wm-close click': function(e) {
					e.stopPropagation();
					e.preventDefault();

					if(this.enabled) {
						this.close();
					}
				},

				'.wm-window-title button.wm-maximize click': function(e) {
					e.stopPropagation();
					e.preventDefault();

					if(this.enabled && this.resizable) {
						this.maximize();
					}
				},

				'.wm-window-title button.wm-minimize click': function(e) {
					e.stopPropagation();
					e.preventDefault();

					if(this.enabled) {
						this.minimize();
					}
				},

				'.wm-window-title button mousedown': function(e) {
					this.focus();

					e.stopPropagation();
					e.preventDefault();
				},

				'button.wm-resize mousedown': function(e) {
					var event = convertMoveEvent(e);

					if(!this.enabled || !this.resizable) {
						return;
					}

					this._resizing = {
						width: this.width - event.pageX,
						height: this.height - event.pageY
					};

					this.el.addClass('resizing');

					e.preventDefault();
				}
			},

			space: {
				'mousemove': function(e) {
					var event = convertMoveEvent(e);

					// Fix #20. Mousemove outside browser
					if (!isTouchEvent(e) && e.which !== 1) {
						this._moving && this._stopMove();
						this._resizing && this._stopResize();
					}

					if (this._moving) {
						this.move(
							event.pageX - this._moving.x,
							event.pageY - this._moving.y
						);
					}

					if(this._resizing) {
						this.resize(
							event.pageX + this._resizing.width,
							event.pageY + this._resizing.height
						);
					}
				},

				'mouseup': function() {
					this._moving && this._stopMove();
					this._resizing && this._stopResize();
				}
			}
		},

		_stopMove: function() {
			this.el.removeClass('move');
			this._moving = null;
		},

		_stopResize: function() {
			this.el.removeClass('resizing');
			this._restore = null;
			this._resizing = null;
		},

		set space(el) {
			if(el && !el.listen) {
				console.error('The given space element is not a valid View');
				return;
			}

			this._space = el;
			el.append(this.el);
			el.listen(this.events.space, this);
		},

		get space() {
			return this._space;
		},

		get maximized() {
			return this._maximized;
		},

		set maximized(value) {
			if(value) {
				if (!this.minimized) {
                    this._restoreMaximized = this.stamp(true);
                } else {
                	this._minimized = false;
                    this._restoreMaximized = this.stamp(true);
                    this._restoreMaximized.prototype.size = this._restoreMinimized.prototype.size;
				}

				this.signals.emit('maximize', this, this._restoreMaximized);
			}
			else {
				this.signals.emit('restore', this, this._restoreMaximized);
			}
			this._maximized = value;
		},


		get minimized() {
			return this._minimized;
		},

		set minimized(value) {
			if(value) {
                if (!this.maximized) {
                    this._restoreMinimized = this.stamp(false);
                } else {
                	this._maximized = false;
				}

				this.signals.emit('minimize', this, this._restoreMinimized);
			}
			else {
				this.signals.emit('restore', this, this._restoreMinimized);
			}

			this._minimized = value;
		},

		set active(value) {
			if(value) {
				this.signals.emit('focus', this);
				this.el.addClass('active');
				this.el.removeClass('inactive');
			}
			else {
				this.signals.emit('blur', this);
				this.el.removeClass('active');
				this.el.addClass('inactive');
			}

			this._active = value;
		},

		get active() {
			return this._active;
		},

		set enabled(value) {
			if(!value) {
				this.el.addClass('disabled');
			}
			else {
				this.el.removeClass('disabled');
			}

			this._enabled = value;
		},

		get enabled() {
			return this._enabled;
		},

		set movable(value) {
			this._movable = !!value;
		},

		get movable() {
			return this._movable;
		},

		set closable(value) {
			if (!value) {
				this.el.addClass('noclosable');
			} else {
				this.el.removeClass('noclosable');
			}

			this._closable = !!value;
		},

		get closable() {
			return this._closable;
		},

		set resizable(value) {
			if(!value) {
				this.el.addClass('noresizable');
			}
			else {
				this.el.removeClass('noresizable');
			}

			this._resizable = !!value;
		},

		get resizable() {
			return this._resizable;
		},

		set closed(value) {}, // jshint ignore:line
		get closed() {
			return this._closed;
		},

		set destroyed(value) {}, // jshint ignore:line
		get destroyed() {
			return this._destroyed;
		},

		set widget(value) {
			this._widget = value;
		},

		get widget() {
			return this._widget;
		},

		set titlebar(value) {
			if(value) {
				this.$titlebar.removeClass('hide');
			}
			else {
				this.$titlebar.addClass('hide');
			}

			this._titlebar = value;
		},

		get titlebar() {
			return this._titlebar;
		},

		set width(value) {
			this.el.width(value);
		},

		get width() {
			return parseInt(this.el.width(), 10);
		},

		set height(value) {
			// This shouldn't be done if flexible box model
			// worked properly with overflow-y: auto
			//this.$content.height(value - this.$header.outerHeight());

			this.el.height(value);
		},

		get height() {
			return parseInt(this.el.height(), 10);
		},

		set x(value) {
            this.el.css('left', Math.max(0, value));
		},

		set y(value) {
            this.el.css('top', Math.min(Math.max(0, value), window.innerHeight - this.$titlebar.height()));
		},

		get x() {
			return parseInt(this.el.css('left'), 10);
		},

		get y() {
			return parseInt(this.el.css('top'), 10);
		},

		set z(value) {
			this.el.css('z-index', value);
		},

		get z() {
			return parseInt(this.el.css('z-index'), 10);
		},

		open: function() {
			var promise = new Promise();
			this.signals.emit('open', this);

			// Open animation
			this.el.show();
			this.el.addClass('opening');
			this.el.onAnimationEnd(function(){
				this.el.removeClass('opening');
				promise.done();
			}, this);

			this._closed = false;
			return promise;
		},

		close: function() {
			var promise = new Promise();
			this.signals.emit('close', this);

			this.el.addClass('closing');
			this.el.onAnimationEnd(function(){
				this.el.removeClass('closing');
				this.el.addClass('closed');
				this.el.hide();

				this.signals.emit('closed', this);
				promise.done();
			}, this);

			this._closed = true;
			return promise;
		},

		destroy: function() {
			var destroy = function() {
				// Remove element
				this.$content.html('');
				this.signals.emit('destroyed', this);

				this._destroyed = true;
			}
			.bind(this);

			this.signals.emit('destroy', this);

			if(!this.closed) {
				this.close().then(function() {
					destroy();
				});
			}
			else {
				destroy();
			}
		},

		resize: function(w, h) {
			this.width = w;
			this.height = h;
			return this;
		},

		move: function(x, y) {
			this.x = x;
			this.y = y;
			return this;
		},

		center: function() {
            this.move((window.innerWidth / 2) - (this.el.outerWidth() / 2), (window.innerHeight / 2) - (this.el.outerHeight() / 2));
        },

		/**
		 * @return A function that restores this window
		 */
		stamp: function(savePos) {
			this.restore = (function() {
				return function() {
					this.resize(this.restore.prototype.size.width, this.restore.prototype.size.height);

					if (this.restore.prototype.savePos) {
                        this.move(this.restore.prototype.pos.x, this.restore.prototype.pos.y);
                    } else {
                    	this.move(this.x, this.y);
					}

                    this.el.onTransitionEnd(function() {
                        this.el.removeClass('maximized minimized');
                    }, this);

					return this;
				};
			}).apply(this);

            this.restore.prototype.savePos = savePos;
            this.restore.prototype.size = {
                width: this.width,
                height: this.height
            };

            this.restore.prototype.pos = {
                x: this.x,
                y: this.y
            };

			return this.restore;
		},

		restore: function(){},

		maximize: function() {
            this.el.removeClass('maximized minimized');

			this.el.addClass('maximazing');
			this.el.addClass('maximized');
			this.el.onTransitionEnd(function(){
				this.el.removeClass('maximazing');
			}, this);

			this.maximized = !this.maximized;
			return this;
		},

		minimize: function() {
            this.el.removeClass('maximized minimized');

			this.el.addClass('minimizing');
			this.el.addClass('minimized');
			this.el.onTransitionEnd(function(){
				this.el.removeClass('minimizing');
			}, this);

			this.minimized = !this.minimized;
			return this;
		},

		focus: function() {
			this.active = true;
			return this;
		},

		blur: function() {
			this.active = false;
			return this;
		},

		toLocal: function(coord) {
			return {
				x: coord.x - this.x,
				y: coord.y - this.y
			};
		},

		toGlobal: function(coord) {
			return {
				x: coord.x + this.x,
				y: coord.y + this.y
			};
		},

		append: function(el) {
			el.appendTo(this.$content);
		}
	};

	return Window;
});
