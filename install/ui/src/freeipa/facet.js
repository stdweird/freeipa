/*  Authors:
 *    Pavel Zuna <pzuna@redhat.com>
 *    Endi Sukma Dewata <edewata@redhat.com>
 *    Adam Young <ayoung@redhat.com>
 *    Petr Vobornik <pvoborni@redhat.com>
 *
 * Copyright (C) 2010-2011 Red Hat
 * see file 'COPYING' for use and warranty information
 *
 * This program is free software; you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <http://www.gnu.org/licenses/>.
 */

define([
        'dojo/_base/declare',
        'dojo/_base/lang',
        'dojo/dom-construct',
        'dojo/on',
        'dojo/Stateful',
        'dojo/Evented',
        './_base/Singleton_registry',
        './builder',
        './ipa',
        './jquery',
        './navigation',
        './phases',
        './reg',
        './rpc',
        './spec_util',
        './text',
        './dialog',
        './field',
        './widget'
       ], function(declare, lang, construct, on, Stateful, Evented,
                   Singleton_registry, builder, IPA, $,
                   navigation, phases, reg, rpc, su, text) {

/**
 * Facet module
 *
 * @class facet
 * @singleton
 */
var exp = {};
exp.facet_spec = {};

/**
 * Facet represents the content of currently displayed page.
 *
 * ## Show, Clear, Refresh mechanism
 *
 * Use cases:
 *
 * - Display facet with defined arguments.
 * - Switch to facet
 * - Update facet state
 *
 * ## Display facet by route
 *
 * 1. somebody sets route
 * 2. Route is evaluated, arguments extracted.
 * 3. Facet state is updated `set_state(args, pkeys)`.(saves previous state)
 * 4. Facet show() is called
 *
 * ## Display facet with defined arguments
 *
 * 1. Somebody calls navigation.show(xxx);
 * 2. Facet state is updated `set_state(args, pkeys)`.(saves previous state)
 * 3. Route is updated, but the hash change is ignored
 * 4. Facet show() is called.
 *      - First time show
 *          a. creates DOM
 *          b. display DOM
 *          c. refresh();
 *      - Next time
 *          a. display DOM
 *          b. `needs_update()` (compares previous state with current)
 *              - true:
 *                1. clear() - each facet can override to supress clear or
 *                           control the behaviour
 *                2. refresh()
 *
 * ## Swith to facet
 *
 * Same as display facet but only without arguments. Arguments are extracted at
 * step 2.
 *
 * ## Update facet state
 *
 * 1. set_state(args, pkeys?)
 * 2. needs_update()?
 *    - true:
 *       1. clear()
 *       2. refresh()
 * 3. Update route, ignore hash change event
 *
 * ## Updating hash
 * Hash updates are responsibility of navigation component and application
 * controller. Application controller should listen to facet's `state_change`
 * event. And call something like navigation.update_hash(facet).
 *
 * navigation.update_hash should find all the necessary state properties (args,
 * pkeys).
 *
 * ## needs_update method
 * todo
 *
 * @class facet.facet
 * @alternateClassName IPA.facet
 */
exp.facet = IPA.facet = function(spec, no_init) {

    spec = spec || {};

    var that = new Evented();

    /**
     * Entity this facet belongs to
     * @property {entity.entity}
     */
    that.entity = IPA.get_entity(spec.entity);

    /**
     * Facet name
     * @property {string}
     */
    that.name = spec.name;

    /**
     * Facet label
     * @property {string}
     */
    that.label = text.get(spec.label);

    /**
     * Facet title
     * @property {string}
     */
    that.title = text.get(spec.title || that.label);

    /**
     * Facet tab label
     * @property {string}
     */
    that.tab_label = text.get(spec.tab_label || that.label);

    /**
     * Facet element's CSS class
     * @property {string}
     */
    that.display_class = spec.display_class;

    /**
     * Flag. Marks the facet as read-only - doesn't support modify&update
     * operation.
     * @property {boolean}
     */
    that.no_update = spec.no_update;

    /**
     * Breadcrumb navigation is not displayed when set.
     * @property {boolean}
     */
    that.disable_breadcrumb = spec.disable_breadcrumb;

    /**
     * Facet tabs are not displayed when set.
     * @property {boolean}
     */
    that.disable_facet_tabs = spec.disable_facet_tabs;

    /**
     * State object for actions
     * @property {facet.state}
     */
    that.action_state = builder.build('', spec.state || {}, {}, { $factory: exp.state });

    /**
     * Collection of facet actions
     * @property {facet.action_holder}
     */
    that.actions = builder.build('', { actions: spec.actions }, {}, { $factory: exp.action_holder } );

    /**
     * Array of actions which are displayed in facet header
     * @property {Array.<string>}
     */
    that.header_actions = spec.header_actions;

    /**
     * Facet header
     * @property {facet.facet_header}
     */
    that.header = spec.header || IPA.facet_header({ facet: that });

    /**
     * Hard override for `needs_update()` logic. When set, `needs_update`
     * should always return this value.
     * @property {boolean}
     */
    that._needs_update = spec.needs_update;

    /**
     * Marks facet as expired - needs update
     *
     * Difference between `_needs_update` is that `expired_flag` should be
     * cleared after update.
     *
     * @property {boolean}
     */
    that.expired_flag = true;

    /**
     * Last time when facet was updated.
     * @property {Date}
     */
    that.last_updated = null;

    /**
     * Timeout[s] from `last_modified` after which facet should be expired
     * @property {number} expire_timeout=600
     */
    that.expire_timeout = spec.expire_timeout || 600; //[seconds]

    /**
     * Raised when facet gets updated
     * @event
     */
    that.on_update = IPA.observer();

    /**
     * Raised after `load()`
     * @event
     */
    that.post_load = IPA.observer();

    /**
     * Dialogs
     * @property {ordered_map}
     */
    that.dialogs = $.ordered_map();

    /**
     * dom_node of container
     * Suppose to contain dom_node of this and other facets.
     * @property {jQuery}
     */
    that.container_node = spec.container_node;

    /**
     * dom_node which contains all content of a facet.
     * Should contain error content and content. When error is moved to
     * standalone facet it will replace functionality of content.
     * @property {jQuery}
     */
    that.dom_node = null;

    /**
     * Facet group name
     * @property {string}
     */
    that.facet_group = spec.facet_group;

    /**
     * Redirection target information.
     *
     * Can be facet and/or entity name.
     * @property {Object}
     * @param {string} entity entity name
     * @param {string} facet facet name
     */
    that.redirect_info = spec.redirect_info;

    /**
     * Public state
     * @property {facet.FacetState}
     */
    that.state = new FacetState();

    /**
     * Set and normalize pkeys. Merges with existing if present. If keys length
     * differs, the alignment is from the last one to the first one.
     */
    that.set_pkeys = function(pkeys) {

        pkeys = that.get_pkeys(pkeys);
        that.state.set('pkeys', pkeys);
    };

    /**
     * Return THE pkey of this facet. Basically the last one of pkeys list.
     *
     * @return {string} pkey
     */
    that.get_pkey = function() {
        var pkeys = that.get_pkeys();
        if (pkeys.length) {
            return pkeys[pkeys.length-1];
        }
        return '';
    };

    /**
     * Gets copy of pkeys list.
     * It automatically adds empty pkeys ('') for each containing entity if not
     * specified.
     *
     * One can get merge current pkeys with supplied if `pkeys` param is
     * specified.
     *
     * @param {string[]} pkeys new pkeys to merge
     * @return {string[]} pkeys
     */
    that.get_pkeys = function(pkeys) {
        var new_keys = [];
        var cur_keys = that.state.get('pkeys') || [];
        var current_entity = that.entity;
        pkeys = pkeys || [];
        var arg_l = pkeys.length;
        var cur_l = cur_keys.length;
        var tot_c = 0;
        while (current_entity) {
            if (current_entity.defines_key) tot_c++;
            current_entity = current_entity.get_containing_entity();
        }

        if (tot_c < arg_l || tot_c < cur_l) throw {
            error: 'Invalid pkeys count. Supplied more than expected.'
        };

        var arg_off = tot_c - arg_l;
        var cur_off = cur_l - tot_c;

        for (var i=0; i<tot_c; i++) {
            // first try to use supplied
            if (tot_c - arg_l - i <= 0) new_keys[i] = pkeys[i-arg_off];
            // then current
            else if (tot_c - cur_l - i <= 0) new_keys[i] = cur_keys[i-cur_off];
            // then empty
            else new_keys[i] = '';
        }

        return new_keys;
    };

    /**
     * Get pkey prefix.
     *
     * Opposite method to `get_pkey` - get's all pkeys except the last one.
     * @return {Array.<string>}
     */
    that.get_pkey_prefix = function() {
        var pkeys = that.get_pkeys();
        if (pkeys.length > 0) pkeys.pop();

        return pkeys;
    };

    /**
     * Checks if two objects has the same properties with equal values.
     *
     * @param {Object} a
     * @param {Object} b
     * @return {boolean} `a` and `b` are value-equal
     * @protected
     */
    that.state_diff = function(a, b) {
        var diff = false;
        var checked = {};

        var check_diff = function(a, b, skip) {

            var same = true;
            skip = skip || {};

            for (var key in a) {
                if (a.hasOwnProperty(key) && !(key in skip)) {
                    var va = a[key];
                    var vb = b[key];
                    if (lang.isArray(va)) {
                        if (IPA.array_diff(va,vb)) {
                            same = false;
                            skip[a] = true;
                            break;
                        }
                    } else {
                        if (va != vb) {
                            same = false;
                            skip[a] = true;
                            break;
                        }
                    }
                }
            }
            return !same;
        };

        diff = check_diff(a,b, checked);
        diff = diff || check_diff(b,a, checked);
        return diff;
    };

    /**
     * Reset facet state to supplied
     *
     * @param {Object} state state to set
     */
    that.reset_state = function(state) {

        if (state.pkeys) {
            state.pkeys = that.get_pkeys(state.pkeys);
        }
        that.state.reset(state);
    };

    /**
     * Get copy of current state
     *
     * @return {Object} state
     */
    that.get_state = function() {
        return that.state.clone();
    };

    /**
     * Merges state into current and notifies it.
     *
     * @param {Object} state object to merge into current state
     */
    that.set_state = function(state) {

        if (state.pkeys) {
            state.pkeys = that.get_pkeys(state.pkeys);
        }
        that.state.set(state);
    };

    /**
     * Handle state set
     * @param {Object} old_state
     * @param {Object} state
     */
    that.on_state_set = function(old_state, state) {
        that._on_state_change(state);
    };


    /**
     * Handle state change
     * @protected
     */
    that._on_state_change = function(state) {

        // basically a show method without displaying the facet
        // TODO: change to something fine grained

        that._notify_state_change(state);

        var needs_update = that.needs_update(state);
        that.old_state = state;

        // we don't have to reflect any changes if facet dom is not yet created
        if (!that.dom_node) {
            if (needs_update) that.set_expired_flag();
            return;
        }

        if (needs_update) {
            that.clear();
        }

        that.show_content();
        that.header.select_tab();

        if (needs_update) {
            that.refresh();
        }
    };

    /**
     * Fires `facet-state-change` event with given state as event parameter.
     *
     * @fires facet-state-change
     * @protected
     * @param {Object} state
     */
    that._notify_state_change =  function(state) {
        that.emit('facet-state-change', {
            facet: that,
            state: state
        });
    };

    /**
     * Get dialog with given name from facet dialog collection
     *
     * @param {string} name
     * @return {IPA.dialog} dialog
     */
    that.get_dialog = function(name) {
        return that.dialogs.get(name);
    };

    /**
     * Add dialog to facet dialog collection
     *
     * @param {IPA.dialog} dialog
     */
    that.dialog = function(dialog) {
        that.dialogs.put(dialog.name, dialog);
        return that;
    };

    /**
     * Create facet's HTML representation
     */
    that.create = function() {

        var entity_name = !!that.entity ? that.entity.name : '';

        if (that.dom_node) {
            that.dom_node.empty();
            that.dom_node.detach();
        } else {
            that.dom_node = $('<div/>', {
                'class': 'facet active-facet',
                name: that.name,
                'data-name': that.name,
                'data-entity': entity_name
            });
        }

        var dom_node = that.dom_node;
        that.container = dom_node;

        if (!that.container_node) throw {
            error: 'Can\'t create facet. No container node defined.'
        };
        var node = dom_node[0];
        construct.place(node,that.container_node);


        if (that.disable_facet_tabs) dom_node.addClass('no-facet-tabs');
        dom_node.addClass(that.display_class);

        that.header_container = $('<div/>', {
            'class': 'facet-header'
        }).appendTo(dom_node);
        that.create_header(that.header_container);

        that.content = $('<div/>', {
            'class': 'facet-content'
        }).appendTo(dom_node);

        that.error_container = $('<div/>', {
            'class': 'facet-content facet-error'
        }).appendTo(dom_node);

        that.create_content(that.content);
        dom_node.removeClass('active-facet');
    };

    /**
     * Create facet header
     *
     * @param {jQuery} container
     * @protected
     */
    that.create_header = function(container) {

        that.header.create(container);

        that.controls = $('<div/>', {
            'class': 'facet-controls'
        }).appendTo(container);
    };

    /**
     * Create content
     *
     * @param {jQuery} container
     * @protected
     * @abstract
     */
    that.create_content = function(container) {
    };

    /**
     * Create control buttons
     *
     * @param {jQuery} container
     * @protected
     */
    that.create_control_buttons = function(container) {

        if (that.control_buttons) {
            that.control_buttons.create(container);
        }
    };

    /**
     * Update h1 element in title container
     *
     * @deprecated Please update title in facet header or it's widget instead.
     */
    that.set_title = function(container, title) {
        var element = $('h1', that.title_container);
        element.html(title);
    };

    /**
     * Show facet
     *
     * - clear & refresh if needs update
     * - mark itself as active facet
     */
    that.show = function() {

        that.entity.facet = that; // FIXME: remove

        if (!that.dom_node) {
            that.create();

            var state = that.state.clone();
            var needs_update = that.needs_update(state);
            that.old_state = state;

            if (needs_update) {
                that.clear();
            }

            that.dom_node.addClass('active-facet');
            that.show_content();
            that.header.select_tab();

            if (needs_update) {
                that.refresh();
            }
        } else {
            that.dom_node.addClass('active-facet');
            that.show_content();
            that.header.select_tab();
        }
    };

    /**
     * Show content container and hide error container.
     *
     * Opposite to `show_error`.
     * @protected
     */
    that.show_content = function() {
        that.content.css('display', 'block');
        that.error_container.css('display', 'none');
    };

    /**
     * Show error container and hide content container.
     *
     * Opposite to `show_content`
     * @protected
     */
    that.show_error = function() {
        that.content.css('display', 'none');
        that.error_container.css('display', 'block');
    };

    /**
     * Check if error is displayed (instead of content)
     *
     * @return {boolean} error visible
     */
    that.error_displayed = function() {
        return that.error_container &&
                    that.error_container.css('display') === 'block';
    };

    /**
     * Un-mark itself as active facet
     */
    that.hide = function() {
        that.dom_node.removeClass('active-facet');
    };

    /**
     * Update widget content with supplied data
     * @param {Object} data
     */
    that.load = function(data) {
        that.data = data;
        that.header.load(data);
    };

    /**
     * Start refresh
     *
     * - get up-to-date data
     * - load the data
     * @abstract
     */
    that.refresh = function() {
    };

    /**
     * Clear all widgets
     * @abstract
     */
    that.clear = function() {
    };

    /**
     * Check if facet needs update
     *
     * That means if:
     *
     * - new state (`state` or supplied state) is different that old_state
     *   (`old_state`)
     * - facet is expired
     *   - `expired_flag` is set or
     *   - expire_timeout takes effect
     * - error is displayed
     *
     *
     * @param {Object} [new_state] supplied state
     * @return {boolean} needs update
     */
    that.needs_update = function(new_state) {

        if (that._needs_update !== undefined) return that._needs_update;

        new_state = new_state || that.state.clone();
        var needs_update = false;

        if (that.expire_timeout && that.expire_timeout > 0) {

            if (!that.last_updated) {
                needs_update = true;
            } else {
                var now = Date.now();
                needs_update = (now - that.last_updated) > that.expire_timeout * 1000;
            }
        }

        needs_update = needs_update || that.expired_flag;
        needs_update = needs_update || that.error_displayed();

        needs_update = needs_update || that.state_diff(that.old_state || {}, new_state);

        return needs_update;
    };

    /**
     * Sets expire flag
     */
    that.set_expired_flag = function() {
        that.expired_flag = true;
    };

    /**
     * Clears `expired_flag` and resets `last_updated`
     */
    that.clear_expired_flag = function() {
        that.expired_flag = false;
        that.last_updated = Date.now();
    };

    /**
     * Check whether the facet is dirty
     *
     * Dirty can mean that value of displayed object was modified but the change
     * was not reflected to data source
     *
     * @returns {boolean}
     */
    that.is_dirty = function() {
        return false;
    };

    /**
     * Whether we can switch to different facet.
     * @returns {boolean}
     */
    that.can_leave = function() {
        return !that.is_dirty();
    };

    /**
     * Get dialog displaying a message explaining why we can't switch facet.
     * User can supply callback which is called when a leave is permitted.
     *
     * TODO: rename to get_leave_dialog
     *
     * @param {Function} permit_callback
     */
    that.show_leave_dialog = function(permit_callback) {

        var dialog = IPA.dirty_dialog({
            facet: that
        });

        dialog.callback = permit_callback;

        return dialog;
    };

    /**
     * Display error page instead of facet content
     *
     * Use this call when unrecoverable error occurs.
     *
     * @param {Object} error_thrown - error to be displayed
     * @param {string} error_thrown.name
     * @param {string} error_thrown.message
     */
    that.report_error = function(error_thrown) {

        var add_option = function(ul, text, handler) {

            var li = $('<li/>').appendTo(ul);
            $('<a />', {
                href: '#',
                text: text,
                click: function() {
                    handler();
                    return false;
                }
            }).appendTo(li);
        };

        var title = text.get('@i18n:error_report.title');
        title = title.replace('${error}', error_thrown.name);

        that.error_container.empty();
        that.error_container.append('<h1>'+title+'</h1>');

        var details = $('<div/>', {
            'class': 'error-details'
        }).appendTo(that.error_container);
        details.append('<p>'+error_thrown.message+'</p>');

        $('<div/>', {
            text: text.get('@i18n:error_report.options')
        }).appendTo(that.error_container);

        var options_list = $('<ul/>').appendTo(that.error_container);

        add_option(
            options_list,
            text.get('@i18n:error_report.refresh'),
            function() {
                that.refresh();
            }
        );

        add_option(
            options_list,
            text.get('@i18n:error_report.main_page'),
            function() {
                navigation.show_default();
            }
        );

        add_option(
            options_list,
            text.get('@i18n:error_report.reload'),
            function() {
                window.location.reload(false);
            }
        );

        that.error_container.append('<p>'+text.get('@i18n:error_report.problem_persists')+'</p>');

        that.show_error();
    };

    /**
     * Get facet based on `redirect_info` and {@link
     * entity.entity.redirect_facet}
     * @return {facet.facet} facet to be redirected to
     */
    that.get_redirect_facet = function() {

        var entity = that.entity;
        while (entity.containing_entity) {
            entity = entity.get_containing_entity();
        }
        var facet_name = that.entity.redirect_facet;
        var entity_name = entity.name;
        var facet;

        if (that.redirect_info) {
            entity_name = that.redirect_info.entity || entity_name;
            facet_name = that.redirect_info.facet || facet_name;
        }

        if (!facet) {
            entity = IPA.get_entity(entity_name);
            facet = entity.get_facet(facet_name);
        }

        return facet;
    };

    /**
     * Redirect to redirection target
     */
    that.redirect = function() {

        var facet = that.get_redirect_facet();
        if (!facet) return;
        navigation.show(facet);
    };

    var redirect_error_codes = [4001];

    /**
     * Redirect if error thrown is
     * @protected
     */
    that.redirect_error = function(error_thrown) {

        /*If the error is in talking to the server, don't attempt to redirect,
          as there is nothing any other facet can do either. */
        for (var i=0; i<redirect_error_codes.length; i++) {
            if (error_thrown.code === redirect_error_codes[i]) {
                that.redirect();
                return;
            }
        }
    };

    /**
     * Initialize facet
     * @protected
     */
    that.init_facet = function() {

        that.action_state.init(that);
        that.actions.init(that);
        that.header.init();
        on(that.state, 'set', that.on_state_set);

        var buttons_spec = {
            $factory: IPA.control_buttons_widget,
            name: 'control-buttons',
            'class': 'control-buttons',
            buttons: spec.control_buttons
        };

        that.control_buttons = IPA.build(buttons_spec);
        that.control_buttons.init(that);
    };

    if (!no_init) that.init_facet();

    // methods that should be invoked by subclasses
    that.facet_create = that.create;
    that.facet_create_header = that.create_header;
    that.facet_create_content = that.create_content;
    that.facet_needs_update = that.needs_update;
    that.facet_show = that.show;
    that.facet_hide = that.hide;
    that.facet_load = that.load;

    return that;
};

/**
 * Facet header
 *
 * Widget-like object which purpose is to render facet's header.
 *
 * By default, facet header consists of:
 *
 * - breadcrumb navigation
 * - title
 * - action list
 * - facet tabs
 *
 * @class facet.facet_header
 * @alternateClassName IPA.facet_header
 */
exp.facet_header = IPA.facet_header = function(spec) {

    spec = spec || {};

    var that = IPA.object();

    /**
     * Facet this header belongs to
     * @property {facet.facet}
     */
    that.facet = spec.facet;

    /**
     * Action list with facet's header actions
     * @property {facet.action_list_widget} action_list
     */

    /**
     * Facet title widget
     * @property {facet.facet_title} title_widget
     */

    /**
     * Initialize facet header
     * @protected
     */
    that.init = function() {

        if (that.facet.header_actions) {

            var widget_builder = IPA.widget_builder({
                widget_options: {
                    entity: that.facet.entity,
                    facet: that.facet
                }
            });

            var widget = {
                $factory: IPA.action_list_widget,
                actions: that.facet.header_actions
            };

            that.action_list = widget_builder.build_widget(widget);
            that.action_list.init(that.facet);
        }

        that.facet.action_state.changed.attach(that.update_summary);

        that.title_widget = IPA.facet_title();
    };

    /**
     * Select tab with the same name as related facet or default
     */
    that.select_tab = function() {
        if (that.facet.disable_facet_tabs) return;

        $(that.facet_tabs).find('a').removeClass('selected');
        var facet_name = that.facet.name;

        if (!facet_name || facet_name === 'default') {
            that.facet_tabs.find('a:first').addClass('selected');
        } else {
            that.facet_tabs.find('a#' + facet_name ).addClass('selected');
        }
    };

    /**
     * Set new pkey in title and breadcrumb navigation
     *
     * Limits the pkey if it's too long.
     *
     * @param {string} value pkey
     */
    that.set_pkey = function(value) {

        if (!value) return;

        var key, i;
        var pkey_max = that.get_max_pkey_length();
        var limited_value = IPA.limit_text(value, pkey_max);

        if (!that.facet.disable_breadcrumb) {
            var breadcrumb = [];

            // all pkeys should be available in facet
            var keys = that.facet.get_pkeys();

            var entity = that.facet.entity.get_containing_entity();
            i = keys.length - 2; //set pointer to first containing entity

            while (entity) {
                key = keys[i];
                breadcrumb.unshift($('<a/>', {
                    'class': 'breadcrumb-element',
                    text: key,
                    title: entity.metadata.label_singular,
                    click: function(entity) {
                        return function() {
                            navigation.show_entity(entity.name, 'default');
                            return false;
                        };
                    }(entity)
                }));

                entity = entity.get_containing_entity();
                i--;
            }

            //calculation of breadcrumb keys length
            keys.push(value);
            var max_bc_l = 140; //max chars which can fit on one line
            var max_key_l = (max_bc_l / keys.length) - 4; //4 chars as divider
            var bc_l = 0;
            var to_limit = keys.length;

            //count how many won't be limited and how much space they take
            for (i=0; i<keys.length; i++) {
                var key_l = keys[i].length;
                if (key_l <= max_key_l) {
                    to_limit--;
                    bc_l += key_l + 4;
                }
            }

            max_key_l = ((max_bc_l - bc_l) / to_limit) - 4;


            that.path.empty();

            for (i=0; i<breadcrumb.length; i++) {
                var item = breadcrumb[i];
                key = IPA.limit_text(keys[i], max_key_l);
                item.text(key);

                that.path.append(' &raquo; ');
                that.path.append(item);
            }

            that.path.append(' &raquo; ');

            key = IPA.limit_text(keys[i], max_key_l);

            $('<span>', {
                'class': 'breadcrumb-element',
                title: value,
                text: key
            }).appendTo(that.path);
        }

        var title_info = {
            title: that.facet.label,
            pkey: limited_value,
            pkey_tooltip: value
        };
        that.title_widget.update(title_info);

        that.adjust_elements();
    };

    /**
     * Create link for facet tab
     * @protected
     * @param {jQuery} container
     * @param {facet.facet} other_facet
     */
    that.create_facet_link = function(container, other_facet) {

        var li = $('<li/>', {
            name: other_facet.name,
            title: other_facet.name,
            click: function() {
                if (li.hasClass('entity-facet-disabled')) {
                    return false;
                }

                var pkeys = that.facet.get_pkeys();
                navigation.show(other_facet, pkeys);

                return false;
            }
        }).appendTo(container);

        $('<a/>', {
            text: other_facet.tab_label,
            id: other_facet.name
        }).appendTo(li);
    };

    /**
     * Create facet tab group
     * @protected
     * @param {jQuery} container
     * @param {Object} facet_group
     */
    that.create_facet_group = function(container, facet_group) {

        var section = $('<div/>', {
            name: facet_group.name,
            'class': 'facet-group'
        }).appendTo(container);

        $('<div/>', {
            'class': 'facet-group-label'
        }).appendTo(section);

        var ul = $('<ul/>', {
            'class': 'facet-tab'
        }).appendTo(section);

        var facets = facet_group.facets.values;
        for (var i=0; i<facets.length; i++) {
            var facet = facets[i];
            that.create_facet_link(ul, facet);
        }
    };

    /**
     * Create header's HTML
     * @param {jQuery} container
     */
    that.create = function(container) {

        that.container = container;

        if (!that.facet.disable_breadcrumb) {
            that.breadcrumb = $('<div/>', {
                'class': 'breadcrumb'
            }).appendTo(container);

            that.back_link = $('<span/>', {
                'class': 'back-link'
            }).appendTo(that.breadcrumb);

            var redirect_facet = that.facet.get_redirect_facet();

            $('<a/>', {
                text: redirect_facet.label,
                click: function() {
                    that.facet.redirect();
                    return false;
                }
            }).appendTo(that.back_link);


            that.path = $('<span/>', {
                'class': 'path'
            }).appendTo(that.breadcrumb);
        }

        that.title_widget.create(container);
        that.title_widget.update({ title: that.facet.label });

        if (that.action_list) {
            that.action_list_container = $('<div/>', {
                'class': 'facet-action-list'
            }).appendTo(container);

            that.action_list.create(that.action_list_container);
        }

        if (!that.facet.disable_facet_tabs) {
            that.facet_tabs = $('<div/>', {
                'class': 'facet-tabs'
            }).appendTo(container);

            var facet_groups = that.facet.entity.facet_groups.values;
            for (var i=0; i<facet_groups.length; i++) {
                var facet_group = facet_groups[i];
                if (facet_group.facets.length) {
                    that.create_facet_group(that.facet_tabs, facet_group);
                }
            }
        }
    };

    /**
     * Update displayed information with new data
     *
     * Data is result of FreeIPA RPC command.
     *
     * Updates (if present in data):
     *
     * - facet group links with number of records
     * - facet group labels with facet's pkey
     *
     * @param {Object} data
     */
    that.load = function(data) {
        if (!data) return;
        var result = data.result.result;
        if (!that.facet.disable_facet_tabs) {
            var pkey = that.facet.get_pkey();

            var facet_groups = that.facet.entity.facet_groups.values;
            for (var i=0; i<facet_groups.length; i++) {
                var facet_group = facet_groups[i];

                var span = $('.facet-group[name='+facet_group.name+']', that.facet_tabs);
                if (!span.length) continue;

                var label = facet_group.label;
                if (pkey && label) {
                    var limited_pkey = IPA.limit_text(pkey, 20);
                    label = label.replace('${primary_key}', limited_pkey);
                } else {
                    label = '';
                }

                var label_container = $('.facet-group-label', span);
                label_container.text(label);
                if (pkey) label_container.attr('title', pkey);

                var facets = facet_group.facets.values;
                for (var j=0; j<facets.length; j++) {
                    var facet = facets[j];
                    var link = $('li[name='+facet.name+'] a', span);

                    var values = result ? result[facet.name] : null;
                    if (values) {
                        link.text(facet.tab_label+' ('+values.length+')');
                    } else {
                        link.text(facet.tab_label);
                    }
                }
            }
        }
    };

    /**
     * Reflect facet's action state summary into title widget class and icon
     * tooltip.
     */
    that.update_summary = function() {
        var summary = that.facet.action_state.summary();

        if (summary.state.length > 0) {
            var css_class = summary.state.join(' ');
            that.title_widget.set_class(css_class);
            that.title_widget.set_icon_tooltip(summary.description);
        }

        that.adjust_elements();
    };

    /**
     * Compute maximum pkey length to be displayed in header
     * @return {number} length
     */
    that.get_max_pkey_length = function() {

        var label_w, max_pkey_w, max_pkey_l, al, al_w, icon_w, char_w, container_w;

        container_w = that.container.width();
        icon_w = that.title_widget.icon.width();
        label_w = that.title_widget.title.width();
        char_w = label_w / that.title_widget.title.text().length;
        max_pkey_w = container_w - icon_w - label_w;
        max_pkey_w -= 10; //some space correction to be safe

        if (that.action_list) {
            al = that.action_list.container;
            al_w = al.width();

            max_pkey_w -=  al_w;
        }

        max_pkey_l = Math.ceil(max_pkey_w / char_w);

        return max_pkey_l;
    };

    /**
     * Adjust position of header widgets, mainly action list, according to
     * title length.
     */
    that.adjust_elements = function() {

        if (that.action_list) {

            var action_list = that.action_list.container;
            var max_width = that.container.width();
            var al_width = action_list.width();
            var title_width = that.title_widget.title_container.width();
            var title_max = max_width - al_width;

            that.title_widget.set_max_width(title_max);
            action_list.css('left', title_width + 'px');
        }
    };

    /**
     * Clear displayed information
     */
    that.clear = function() {
        that.load();
        if (that.action_list) that.action_list.clear();
    };

    return that;
};

/**
 * Facet title widget
 *
 * A widget-like object for title representation in a facet header.
 *
 * @class facet.facet_title
 * @alternateClassName IPA.facet_title
 */
exp.facet_title = IPA.facet_title = function(spec) {

    spec = spec || {};

    var that = IPA.object();

    /**
     * Update displayed information with supplied data
     *
     * @param {Object} data
     * @param {string} data.pkey
     * @param {string} data.title
     * @param {string} data.tooltip
     * @param {string} data.icon_tooltip
     * @param {string} data.css_class css class for title container
     */
    that.update = function(data) {

        var tooltip = data.tooltip || data.title;
        var pkey_tooltip = data.pkey_tooltip || data.pkey;
        var icon_tooltip = data.icon_tooltip || '';

        that.title.text(data.title);
        that.title.attr('title', tooltip);

        if (data.pkey) {
            that.title.text(data.title + ': ');
            that.pkey.text(data.pkey);
            that.pkey.attr('title', pkey_tooltip);
        }

        if (data.css_class) that.set_class(data.css_class);

        that.set_icon_tooltip(icon_tooltip);
    };

    /**
     * Create HTML elements
     */
    that.create = function(container) {

        that.title_container = $('<div/>', {
            'class': 'facet-title'
        }).appendTo(container);

        var h3 = $('<h3/>').appendTo(that.title_container);

        that.icon = $('<i />', {
            'class': 'header-icon'
        }).appendTo(h3);

        that.title = $('<span/>').appendTo(h3);

        that.pkey = $('<span/>', {
            'class': 'facet-pkey'
        }).appendTo(h3);
    };

    /**
     * Set maximum width of the widget
     *
     * @param {number|string} width
     */
    that.set_max_width = function(width) {
        that.title_container.css('max-width', width+'px');
    };

    /**
     * Set CSS class
     *
     * Can be used for various purposes like icon change.
     *
     * @param {string} css_class
     */
    that.set_class = function(css_class) {

        if (that.css_class) {
            that.title_container.removeClass(that.css_class);
        }

        if (css_class) {
            that.title_container.addClass(css_class);
        }

        that.css_class = css_class;
    };

    /**
     * Set icon tooltip
     *
     * @param {string} tooltip
     */
    that.set_icon_tooltip = function(tooltip) {
        that.icon.attr('title', tooltip);
    };

    return that;
};

/**
 * Facet which displays information in a table
 *
 * @class facet.table_facet
 * @extends facet.facet
 * @alternateClassName IPA.table_facet
 */
exp.table_facet = IPA.table_facet = function(spec, no_init) {

    spec = spec || {};

    var that = IPA.facet(spec, no_init);

    /**
     * Entity of data displayed in the table
     * @property {entity.entity}
     */
    that.managed_entity = spec.managed_entity ? IPA.get_entity(spec.managed_entity) : that.entity;

    /**
     * Show pagination control
     * @property {boolean}
     */
    that.pagination = spec.pagination === undefined ? true : spec.pagination;

    /**
     * Get complete records on search, otherwise pkeys only.
     */
    that.search_all_entries = spec.search_all_entries;

    /**
     * Sort records
     */
    that.sort_enabled = spec.sort_enabled === undefined ? true : spec.sort_enabled;

    /**
     * Records are selectable
     *
     * Ie. by checkboxes
     */
    that.selectable = spec.selectable === undefined ? true : spec.selectable;

    /**
     * Raised when selection changes
     * @event
     */
    that.select_changed = IPA.observer();

    /**
     * Record's attribute name which controls whether row will be displayed
     * as enabled or disabled.
     *
     * Mutually exclusive with `row_disabled_attribute`
     * @property {string}
     */
    that.row_enabled_attribute = spec.row_enabled_attribute;

    /**
     * Same as `row_enabled_attribute`
     * @property {string}
     */
    that.row_disabled_attribute = spec.row_disabled_attribute;

    /**
     * Name of record's details facet
     * @property {string}
     */
    that.details_facet_name = spec.details_facet || 'default';

    /**
     * Name of facet's table
     */
    that.table_name = spec.table_name;

    /**
     * Facet's table columns
     */
    that.columns = $.ordered_map();

    /**
     * Get all columns
     */
    that.get_columns = function() {
        return that.columns.values;
    };

    /**
     * Get column with given name
     * @param {string} name column name
     */
    that.get_column = function(name) {
        return that.columns.get(name);
    };

    /**
     * Add column
     * @param {IPA.column} column
     */
    that.add_column = function(column) {
        column.entity = that.managed_entity;
        column.facet = that;
        that.columns.put(column.name, column);
    };

    /**
     * Create column according to spec and add it to column collection
     * @param {Object} spec  column spec
     */
    that.create_column = function(spec) {
        var column;
        if (spec instanceof Object) {
            var factory = spec.$factory || IPA.column;
        } else {
            factory = IPA.column;
            spec = { name: spec };
        }

        spec.entity = that.managed_entity;
        column = factory(spec);

        that.add_column(column);
        return column;
    };

    /**
     * Same as `create_column`
     * @deprecated
     */
    that.column = function(spec){
        that.create_column(spec);
        return that;
    };

    /**
     * @inheritDoc
     */
    that.create_content = function(container) {
        that.table.create(container);
    };

    /**
     * Transforms data into records and displays them in the end.
     *
     * 1. table is loaded with supplied data
     * 2. expire flag is cleared
     *
     * @fires post_load
     * @param {Object} data
     */
    that.load = function(data) {
        that.facet_load(data);

        if (!data) {
            that.table.empty();
            that.table.summary.text('');
            that.table.pagination_control.css('visibility', 'hidden');
            return;
        }

        that.table.current_page = 1;
        that.table.total_pages = 1;

        if (that.pagination) {
            that.load_page(data);
        } else {
            that.load_all(data);
        }

        that.table.current_page_input.val(that.table.current_page);
        that.table.total_pages_span.text(that.table.total_pages);

        that.table.pagination_control.css('visibility', 'visible');

        that.post_load.notify([data], that);
        that.clear_expired_flag();
    };


    /**
     * Transforms data into records and displays them in the end.
     *
     * It's expected that `data` contain complete records.
     *
     * @protected
     * @param {Object} data
     */
    that.load_all = function(data) {

        var result = data.result.result;
        var records = [];
        for (var i=0; i<result.length; i++) {
            var record = that.table.get_record(result[i], 0);
            records.push(record);
        }
        that.load_records(records);

        if (data.result.truncated) {
            var message = text.get('@i18n:search.truncated');
            message = message.replace('${counter}', data.result.count);
            that.table.summary.text(message);
        } else {
            that.table.summary.text(data.result.summary || '');
        }
    };

    /**
     * Create a map with records as values and pkeys as keys
     *
     * Extracts records from data, where data originates from RPC command.
     *
     * @protected
     * @param {Object} data RPC command data
     * @return {ordered_map} record map
     */
    that.get_records_map = function(data) {

        var records_map = $.ordered_map();

        var result = data.result.result;
        var pkey_name = that.managed_entity.metadata.primary_key;

        for (var i=0; i<result.length; i++) {
            var record = result[i];
            var pkey = record[pkey_name];
            if (pkey instanceof Array) pkey = pkey[0];
            records_map.put(pkey, record);
        }

        return records_map;
    };

    /**
     * Transforms data into records and displays them in the end.
     *
     * - subset is selected if data contains more than page-size results
     * - page is selected based on `state.page`
     * - get complete records by `get_records()` method when data contains only
     *   pkeys (skipped if table has only one column - pkey)
     *
     * @protected
     * @param {Object} data
     */
    that.load_page = function(data) {

        // get primary keys (and the complete records if search_all_entries is true)
        var records_map = that.get_records_map(data);

        var total = records_map.length;
        that.table.total_pages = total ? Math.ceil(total / that.table.page_length) : 1;

        delete that.table.current_page;

        var page = parseInt(that.state.page, 10) || 1;
        if (page < 1) {
            that.state.set({page: 1});
            return;
        } else if (page > that.table.total_pages) {
            that.state.set({page: that.table.total_pages});
            return;
        }
        that.table.current_page = page;

        if (!total) {
            that.table.summary.text(text.get('@i18n:association.no_entries'));
            that.load_records([]);
            return;
        }

        // calculate the start and end of the current page
        var start = (that.table.current_page - 1) * that.table.page_length + 1;
        var end = that.table.current_page * that.table.page_length;
        end = end > total ? total : end;

        var summary = text.get('@i18n:association.paging');
        summary = summary.replace('${start}', start);
        summary = summary.replace('${end}', end);
        summary = summary.replace('${total}', total);
        that.table.summary.text(summary);

        // sort map based on primary keys
        if (that.sort_enabled) {
            records_map = records_map.sort();
        }

        // trim map leaving the entries visible in the current page only
        records_map = records_map.slice(start-1, end);

        var columns = that.table.columns.values;
        if (columns.length == 1) { // show primary keys only
            that.load_records(records_map.values);
            return;
        }

        if (that.search_all_entries) {
            // map contains the primary keys and the complete records
            that.load_records(records_map.values);
            return;
        }

        // get the complete records
        that.get_records(
            records_map.keys,
            function(data, text_status, xhr) {
                var results = data.result.results;
                for (var i=0; i<records_map.length; i++) {
                    var pkey = records_map.keys[i];
                    var record = records_map.get(pkey);
                    // merge the record obtained from the refresh()
                    // with the record obtained from get_records()
                    $.extend(record, results[i].result);
                }
                that.load_records(records_map.values);
            },
            function(xhr, text_status, error_thrown) {
                that.load_records([]);
                var summary = that.table.summary.empty();
                summary.append(error_thrown.name+': '+error_thrown.message);
            }
        );
    };

    /**
     * Clear table and add new rows with supplied records.
     *
     * Select previously selected rows.
     *
     * @param {Array.<Object>} records
     */
    that.load_records = function(records) {
        that.table.empty();
        that.table.records = records;
        for (var i=0; i<records.length; i++) {
            that.add_record(records[i]);
        }
        that.table.set_values(that.selected_values);
    };

    /**
     * Add new row to table
     *
     * Enables/disables row according to `row_enabled_attribute` or
     * `row_disabled_attribute` and optional column formatter for that attr.
     *
     * @protected
     * @param {Object} record
     */
    that.add_record = function(record) {

        var tr = that.table.add_record(record);

        var attribute;
        if (that.row_enabled_attribute) {
            attribute = that.row_enabled_attribute;
        } else if (that.row_disabled_attribute) {
            attribute = that.row_disabled_attribute;
        } else {
            return;
        }

        var value = record[attribute];
        var column = that.table.get_column(attribute);
        if (column.formatter) value = column.formatter.parse(value);

        that.table.set_row_enabled(tr, value);
    };

    /**
     * Get command name used in get_records
     * @protected
     * @return {string} command name
     */
    that.get_records_command_name = function() {
        return that.managed_entity.name+'_get_records';
    };

    /**
     * Create batch RPC command for obtaining complete records for each supplied
     * primary key.
     *
     * @protected
     * @param {Array.<string>} pkeys primary keys
     * @param {Function} on_success command success handler
     * @param {Function} on_failure command error handler
     */
    that.create_get_records_command = function(pkeys, on_success, on_error) {

        var batch = rpc.batch_command({
            name: that.get_records_command_name(),
            on_success: on_success,
            on_error: on_error
        });

        for (var i=0; i<pkeys.length; i++) {
            var pkey = pkeys[i];

            var command = rpc.command({
                entity: that.table.entity.name,
                method: 'show',
                args: [pkey]
            });

            if (that.table.entity.has_members()) {
                command.set_options({no_members: true});
            }

            batch.add_command(command);
        }

        return batch;
    };

    /**
     * Execute command for obtaining complete records
     *
     * @protected
     * @param {Array.<string>} pkeys primary keys
     * @param {Function} on_success command success handler
     * @param {Function} on_failure command error handler
     */
    that.get_records = function(pkeys, on_success, on_error) {

        var batch = that.create_get_records_command(pkeys, on_success, on_error);

        batch.execute();
    };

    /**
     * Get values selected in a table (checked rows)
     * @return {Array.<string>} values
     */
    that.get_selected_values = function() {
        return that.table.get_selected_values();
    };

    /**
     * Create table
     *
     * - reflect facet settings (pagination, scrollable, ...)
     * - create columns
     * - override handler for pagination
     *
     * @protected
     * @param {entity.entity} entity table entity
     */
    that.init_table = function(entity) {

        that.table = IPA.table_widget({
            'class': 'content-table',
            name: that.table_name || entity.metadata.primary_key,
            label: entity.metadata.label,
            entity: entity,
            pagination: true,
            scrollable: true,
            selectable: that.selectable && !that.read_only
        });

        var columns = that.columns.values;
        for (var i=0; i<columns.length; i++) {
            var column = columns[i];

            var metadata = IPA.get_entity_param(entity.name, column.name);
            column.primary_key = metadata && metadata.primary_key;
            column.link = (column.link === undefined ? true : column.link) && column.primary_key;

            if (column.link && column.primary_key) {
                column.link_handler = function(value) {
                    var pkeys = [value];

                    // for nested entities
                    var containing_entity = entity.get_containing_entity();
                    if (containing_entity && that.entity.name === containing_entity.name) {
                        pkeys = that.get_pkeys();
                        pkeys.push(value);
                    }

                    navigation.show_entity(entity.name, that.details_facet_name, pkeys);
                    return false;
                };
            }

            that.table.add_column(column);
        }

        that.table.select_changed = function() {
            that.selected_values = that.get_selected_values();
            that.select_changed.notify([that.selected_values]);
        };

        that.table.prev_page = function() {
            if (that.table.current_page > 1) {
                var page = that.table.current_page - 1;
                that.set_expired_flag();
                that.state.set({page: page});
            }
        };

        that.table.next_page = function() {
            if (that.table.current_page < that.table.total_pages) {
                var page = that.table.current_page + 1;
                that.set_expired_flag();
                that.state.set({page: page});
            }
        };

        that.table.set_page = function(page) {
            if (page < 1) {
                page = 1;
            } else if (page > that.total_pages) {
                page = that.total_pages;
            }
            that.set_expired_flag();
            that.state.set({page: page});
        };
    };

    /**
     * Create and add columns based on spec
     */
    that.init_table_columns = function() {
        var columns = spec.columns || [];
        for (var i=0; i<columns.length; i++) {
            that.create_column(columns[i]);
        }
    };

    if (!no_init) that.init_table_columns();

    that.table_facet_create_get_records_command = that.create_get_records_command;

    return that;
};

/**
 * Facet group
 *
 * Collection of facets with similar purpose.
 *
 * @class facet.facet_group
 * @alternateClassName IPA.facet_group
 */
exp.facet_group = IPA.facet_group = function(spec) {

    spec = spec || {};

    var that = IPA.object();

    /**
     * Name
     * @property {string}
     */
    that.name = spec.name;

    /**
     * Label
     * @property {string}
     */
    that.label = text.get(spec.label);

    /**
     * Facet collection
     * @property {ordered_map}
     */
    that.facets = $.ordered_map();

    /**
     * Add facet to the map
     * @param {facet.facet} facet
     */
    that.add_facet = function(facet) {
        that.facets.put(facet.name, facet);
    };

    /**
     * Get facet with given name
     * @param {string} name
     * @return {facet.facet/null}
     */
    that.get_facet = function(name) {
        return that.facets.get(name);
    };

    /**
     * Get index of facet with given name
     * @param {string} name
     * @return {facet.facet/null}
     */
    that.get_facet_index = function(name) {
        return that.facets.get_key_index(name);
    };

    /**
     * Get facet by position in collection
     * @param {number} index
     * @return {facet.facet/null}
     */
    that.get_facet_by_index = function(index) {
        return that.facets.get_value_by_index(index);
    };

    /**
     * Get number of facet in collection
     * @return {number} count
     */
    that.get_facet_count = function() {
        return that.facets.length;
    };

    return that;
};

/**
 * Action
 *
 * @class facet.action
 * @alternateClassName IPA.action
 */
exp.action = IPA.action = function(spec) {

    spec = spec || {};

    var that = IPA.object();

    /**
     * Name
     *
     * Action identifier within facet
     * @property {string}
     */
    that.name = spec.name;

    /**
     * Label
     * @property {string}
     */
    that.label = text.get(spec.label);

    /**
     * Enabled
     *
     * Action can't be executed when not enabled.
     * @property {boolean}
     * @readonly
     */
    that.enabled = spec.enabled !== undefined ? spec.enabled : true;

    /**
     * List of states required by action to be enabled
     * @property {Array.<string>}
     */
    that.enable_cond = spec.enable_cond || [];

    /**
     * List of states which makes action disabled
     * @property {Array.<string>}
     */
    that.disable_cond = spec.disable_cond || [];

    /**
     * Value of `enabled` property changed
     * @event
     */
    that.enabled_changed = IPA.observer();

    /**
     * Controls whether action or representing widget should be visible.
     *
     * Action can't be executed when not visible.
     * @property {boolean}
     * @readonly
     */
    that.visible = spec.visible !== undefined ? spec.visible : true;

    /**
     * List of states required by action to be visible
     * @property {Array.<string>}
     */
    that.show_cond = spec.show_cond || [];

    /**
     * List of states which makes action not visible
     * @property {Array.<string>}
     */
    that.hide_cond = spec.hide_cond || [];

    /**
     * Value of `visible` property changed
     * @event
     */
    that.visible_changed = IPA.observer();

    /**
     * Action execution logic
     *
     * One has to set `handler` or override `execute_action` method.
     *
     * @property {Function} handler
     * @property {facet.facet} handler.facet
     * @property {Function} handler.on_success
     * @property {Function} handler.on_error
     */
    that.handler = spec.handler;

    /**
     * Controls whether action must be confirmed.
     *
     * If so, confirm dialog is displayed before actual execution.
     * @property {boolean}
     */
    that.needs_confirm = spec.needs_confirm !== undefined ? spec.needs_confirm : false;

    /**
     * Message to be displayed in confirm dialog
     * @property {string}
     */
    that.confirm_msg = text.get(spec.confirm_msg || '@i18n:actions.confirm');

    /**
     * Spec of confirm dialog
     *
     * Defaults to: {@link IPA.confirm_dialog}
     */
    that.confirm_dialog = spec.confirm_dialog !== undefined ? spec.confirm_dialog :
                                                              IPA.confirm_dialog;

    /**
     * Performs actual action execution
     *
     * - override point
     *
     * @protected
     * @param {facet.facet} facet
     * @param {Function} on_success
     * @param {Function} on_error
     */
    that.execute_action = function(facet, on_success, on_error) {

        if (that.handler) {
            that.handler(facet, on_success, on_error);
        }
    };

    /**
     * Execute action
     *
     * - only if enabled and visible
     * - confirm dialog is display if configured
     *
     * @param {facet.facet} facet
     * @param {Function} on_success
     * @param {Function} on_error
     */
    that.execute = function(facet, on_success, on_error) {

        if (!that.enabled || !that.visible) return;

        if (that.needs_confirm) {

            var confirmed = false;

            if (that.confirm_dialog) {

                that.dialog = IPA.build(that.confirm_dialog);
                that.update_confirm_dialog(facet);
                that.dialog.on_ok = function () {
                    that.execute_action(facet, on_success, on_error);
                };
                that.dialog.open();
            } else {
                var msg = that.get_confirm_message(facet);
                confirmed = IPA.confirm(msg);
            }

            if (!confirmed) return;
        }

        that.execute_action(facet, on_success, on_error);
    };

    /**
     * Set confirm message to confirm dialog
     * @protected
     * @param {facet.facet} facet
     */
    that.update_confirm_dialog = function(facet) {
        that.dialog.message = that.get_confirm_message(facet);
    };

    /**
     * Get confirm message
     *
     * - override point for message modifications
     *
     * @protected
     * @param {facet.facet} facet
     */
    that.get_confirm_message = function(facet) {
        return that.confirm_msg;
    };

    /**
     * Setter for `enabled`
     *
     * @fires enabled_changed
     * @param {boolean} enabled
     */
    that.set_enabled = function(enabled) {

        var old = that.enabled;

        that.enabled = enabled;

        if (old !== that.enabled) {
            that.enabled_changed.notify([that.enabled], that);
        }
    };

    /**
     * Setter for `visible`
     *
     * @fires enabled_changed
     * @param {boolean} visible
     */
    that.set_visible = function(visible) {

        var old = that.visible;

        that.visible = visible;

        if (old !== that.visible) {
            that.visible_changed.notify([that.visible], that);
        }
    };

    return that;
};

/**
 * Action collection and state reflector
 *
 * - sets `enabled` and `visible` action properties at action state change
 *   and facet load
 *
 * @class facet.action_holder
 * @alternateClassName IPA.action_holder
 */
exp.action_holder = IPA.action_holder = function(spec) {

    spec = spec || {};

    var that = IPA.object();

    /**
     * Collection of actions
     * @property {ordered_map}
     * @protected
     */
    that.actions = $.ordered_map();

    /**
     * Build actions defined in spec.
     * Register handlers for facet events(`action_state.changed`, `post_load`)
     * @param {facet.facet} facet
     */
    that.init = function(facet) {

        var i, action, actions;

        that.facet = facet;
        actions = builder.build('action', spec.actions) || [];

        for (i=0; i<actions.length; i++) {
            action = actions[i];
            that.actions.put(action.name, action);
        }

        that.facet.action_state.changed.attach(that.state_changed);
        that.facet.post_load.attach(that.on_load);
    };

    /**
     * Evaluate actions `visibility` and `enable` according to action conditions
     * and supplied state
     *
     * @param {Array.<string>} state
     */
    that.state_changed = function(state) {

        var actions, action, i, enabled, visible;

        actions = that.actions.values;

        for (i=0; i<actions.length; i++) {

            action = actions[i];

            enabled = IPA.eval_cond(action.enable_cond, action.disable_cond, state);
            visible = IPA.eval_cond(action.show_cond, action.hide_cond, state);
            action.set_enabled(enabled);
            action.set_visible(visible);
        }
    };

    /**
     * Get action with given named
     * @param {string} name
     * @return {facet.action}
     */
    that.get = function(name) {
        return that.actions.get(name);
    };

    /**
     * Add action to collection
     * @param {facet.action} action
     */
    that.add = function(action) {
        that.actions.put(action.name, action);
    };

    /**
     * Facet load event handler
     *
     * - gets action state and evaluates action conditions
     * @protected
     */
    that.on_load = function() {
        var state = that.facet.action_state.get();
        that.state_changed(state);
    };

    return that;
};

/**
 * Facet action state
 *
 * @class facet.state
 * @alternateClassName IPA.state
 */
exp.state = IPA.state = function(spec) {

    spec = spec || {};

    var that = IPA.object();

    /**
     * State map
     *
     * - key: evaluator's name
     * - value: evaluator's value
     * @property {ordered_map}
     * @protected
     */
    that.state = $.ordered_map();

    /**
     * Raised when state changes.
     *
     * - params: state
     * - context: this
     * @event
     */
    that.changed = IPA.observer();

    /**
     * State evaluators
     * @property {Array.<facet.state_evaluator>}
     */
    that.evaluators = builder.build('state_evaluator', spec.evaluators) || [];

    /**
     * Summary evaluators
     * @property {facet.summary_evaluator}
     */
    that.summary_evaluator = builder.build('', spec.summary_evaluator || IPA.summary_evaluator);

    /**
     * Summary conditions
     * @property {Array.<Object>}
     */
    that.summary_conditions = builder.build('', spec.summary_conditions) || [];

    /**
     * Initializes evaluators
     *
     * @param {facet.facet} facet
     */
    that.init = function(facet) {

        var i, evaluator;

        that.facet = facet;

        for (i=0; i<that.evaluators.length; i++) {
            evaluator = that.evaluators[i];
            evaluator.init(facet);
            evaluator.changed.attach(that.on_eval_changed);
        }
    };

    /**
     * Event handler for evaluator's 'changed' event
     * @protected
     */
    that.on_eval_changed = function() {

        var evaluator = this;

        that.state.put(evaluator.name, evaluator.state);

        that.notify();
    };

    /**
     * Get unified state
     *
     * @return {Array.<string>}
     */
    that.get = function() {

        var state, i;

        state = [];

        var values = that.state.values;

        for (i=0; i<values.length; i++) {
            $.merge(state, values[i]);
        }

        return state;
    };

    /**
     * Evaluate and get summary
     * @return {Object} summary
     */
    that.summary = function() {

        var summary = that.summary_evaluator.evaluate(that);
        return summary;
    };

    /**
     * Raise change event with state as parameter
     * @protected
     * @fires changed
     */
    that.notify = function(state) {

        state = state || that.get();

        that.changed.notify([state], that);
    };

    return that;
};

/**
 * Summary evaluator for {@link facet.state}
 * @class facet.summary_evaluator
 * @alternateClassName IPA.summary_evaluator
 */
exp.summary_evaluator = IPA.summary_evaluator = function(spec) {

    spec = spec || {};

    var that = IPA.object();

    that.evaluate = function(state) {

        var conds, cond, i, summary, state_a;

        conds = state.summary_conditions;
        state_a = state.get();

        for (i=0; i<conds.length; i++) {
            cond = conds[i];
            if (IPA.eval_cond(cond.pos, cond.neg, state_a)) {
                summary = {
                    state: cond.state,
                    description: cond.description
                };
                break;
            }
        }

        summary = summary ||  {
            state: state_a,
            description: ''
        };

        return summary;
    };

    return that;
};

/**
 * State evaluator for {@link facet.state}.
 *
 * - Base class for specific evaluators.
 * - Evaluator observes facet and reflect its state by a list of string tags
 *   (evaluated state).
 * - Default behavior is that evaluator listens to event, specified by
 *   `event_name` property. The event is handled by `on_event` method.
 *   Descendant classes should override this method. Methods like `on_event`
 *   should notify state change using `notify_on_change` method.
 *
 * @class facet.state_evaluator
 * @alternateClassName IPA.state_evaluator
 */
exp.state_evaluator = IPA.state_evaluator = function(spec) {

    spec = spec || {};

    var that = IPA.object();

    /**
     * Name
     * @property {string}
     */
    that.name = spec.name || 'state_evaluator';

    /**
     * Event name
     * @property {string}
     */
    that.event_name = spec.event;

    /**
     * State changes
     *
     * - Params: state
     * - Context: this
     * @event
     * @property {IPA.observer}
     */
    that.changed = IPA.observer();

    /**
     * Evaluated state
     * @property {Array.<string>}
     */
    that.state = [];

    /**
     * State is changed for the first time
     * @property {boolean}
     */
    that.first_pass = true;

    /**
     * Init the evaluator
     *
     * - register event listener
     * @param {facet.facet} facet
     */
    that.init = function(facet) {

        if (that.event_name && facet[that.event_name]) {
            facet[that.event_name].attach(that.on_event);
        }
    };

    /**
     * Event handler
     *
     * @localdoc - intended to be overridden
     */
    that.on_event = function() {
    };

    /**
     * Notify state change
     * @fires changed
     * @protected
     * @param {Array.<string>} old_state
     */
    that.notify_on_change = function(old_state) {

        if (that.first_pass || IPA.array_diff(that.state, old_state)) {
            that.changed.notify([that.state], that);
            that.first_pass = false;
        }
    };

    return that;
};

/**
 * Sets 'dirty' state when facet is dirty
 * @class facet.dirty_state_evaluator
 * @extends facet.state_evaluator
 * @alternateClassName IPA.dirty_state_evaluator
 */
exp.dirty_state_evaluator = IPA.dirty_state_evaluator = function(spec) {

    spec = spec || {};

    spec.event = spec.event || 'dirty_changed';

    var that = IPA.state_evaluator(spec);
    that.name = spec.name || 'dirty_state_evaluator';

    /**
     * Handles 'dirty_changed' event
     * @param {boolean} dirty
     */
    that.on_event = function(dirty) {

        var old_state = that.state;
        that.state = [];

        if (dirty) {
            that.state.push('dirty');
        }

        that.notify_on_change(old_state);
    };

    return that;
};

/**
 * Sets 'item-selected' state when table facets selection changes and some
 * record is selected.
 * @class facet.selected_state_evaluator
 * @extends facet.state_evaluator
 * @alternateClassName IPA.selected_state_evaluator
 */
exp.selected_state_evaluator = IPA.selected_state_evaluator = function(spec) {

    spec = spec || {};

    spec.event = spec.event || 'select_changed';

    var that = IPA.state_evaluator(spec);
    that.name = spec.name || 'selected_state_evaluator';

    /**
     * Handles 'select_changed' event
     * @param {Array} selected
     */
    that.on_event = function(selected) {

        var old_state = that.state;
        that.state = [];

        if (selected && selected.length > 0) {
            that.state.push('item-selected');
        }

        that.notify_on_change(old_state);
    };

    return that;
};

/**
 * Sets 'self-service' state when in self-service mode
 * @class facet.self_service_state_evaluator
 * @extends facet.state_evaluator
 * @alternateClassName IPA.self_service_state_evaluator
 */
exp.self_service_state_evaluator = IPA.self_service_state_evaluator = function(spec) {

    spec = spec || {};

    spec.event = spec.event || 'post_load';

    var that = IPA.state_evaluator(spec);
    that.name = spec.name || 'self_service_state_evaluator';

    /**
     * Evaluates self-service
     */
    that.on_event = function() {

        var old_state = that.state;
        that.state = [];

        if (IPA.is_selfservice) {
            that.state.push('self-service');
        }

        that.notify_on_change(old_state);
    };

    return that;
};

/**
 * Set desired state when facet parameter is equal to desired value after
 * facet event(`post_load` by default).
 *
 * @class facet.facet_attr_state_evaluator
 * @extends facet.state_evaluator
 * @alternateClassName IPA.facet_attr_state_evaluator
 */
exp.facet_attr_state_evaluator = IPA.facet_attr_state_evaluator = function(spec) {

    spec = spec || {};

    spec.event = spec.event || 'post_load';

    var that = IPA.state_evaluator(spec);
    that.name = spec.name || 'facet_attr_se';

    /**
     * Facet attribute name
     * @property {string}
     */
    that.attribute = spec.attribute;

    /**
     * Value to compare
     */
    that.value = spec.value;

    /**
     * State to add when value is equal
     * @property {string}
     */
    that.state_value = spec.state_value;

    /**
     * Compare facet's value with desired and set state if equal.
     */
    that.on_event = function() {

        var old_state = that.state;
        that.state = [];

        var facet = this;

        if (facet[that.attribute] === that.value) {
            that.state.push(that.state_value);
        }

        that.notify_on_change(old_state);
    };

    return that;
};

/**
 * Set `read_only` state when facet is `read_only`
 *
 * @class facet.read_only_state_evaluator
 * @extends facet.facet_attr_state_evaluator
 * @alternateClassName IPA.read_only_state_evaluator
 */
exp.read_only_state_evaluator = IPA.read_only_state_evaluator = function(spec) {

    spec = spec || {};

    spec.name = spec.name || 'read_only_se';
    spec.attribute = spec.attribute || 'read_only';
    spec.state_value = spec.state_value || 'read-only';
    spec.value = spec.value !== undefined ? spec.value : true;

    var that = IPA.facet_attr_state_evaluator(spec);
    return that;
};

/**
 * Set `direct` state when facet's association_type property is `direct`
 *
 * @class facet.association_type_state_evaluator
 * @extends facet.facet_attr_state_evaluator
 * @alternateClassName IPA.association_type_state_evaluator
 */
exp.association_type_state_evaluator = IPA.association_type_state_evaluator = function(spec) {

    spec = spec || {};

    spec.name = spec.name || 'association_type_se';
    spec.attribute = spec.attribute || 'association_type';
    spec.state_value = spec.state_value || 'direct';
    spec.value = spec.value !== undefined ? spec.value : 'direct';

    var that = IPA.facet_attr_state_evaluator(spec);
    return that;
};

/**
 * Button for executing facet action
 *
 * Usable as facet control button in {@link facet.control_buttons_widget}.
 *
 * @class facet.action_button_widget
 * @extends IPA.widget
 * @alternateClassName IPA.action_button_widget
 */
exp.action_button_widget = IPA.action_button_widget = function(spec) {

    spec = spec || {};

    var that = IPA.widget(spec);

    /**
     * Name
     * @property {string}
     */
    that.name = spec.name;

    /**
     * Label
     * @property {string}
     */
    that.label = text.get(spec.label);

    /**
     * Tooltip
     * @property {string}
     */
    that.tooltip = text.get(spec.tooltip);

    /**
     * Button href
     *
     * - purely visual thing, the click itself is handled internally.
     * @property {string}
     */
    that.href = spec.href || that.name;

    /**
     * Icon name
     * @property {string}
     */
    that.icon = spec.icon;

    /**
     * Name of action this button should execute
     * @property {string}
     */
    that.action_name = spec.action || that.name;

    /**
     * Enabled
     * @property {boolean}
     * @readonly
     */
    that.enabled = spec.enabled !== undefined ? spec.enabled : true;

    /**
     * Visible
     * @property {boolean}
     * @readonly
     */
    that.visible = spec.visible !== undefined ? spec.visible : true;

    /**
     * Subject to removal
     * @deprecated
     */
    that.show_cond = spec.show_cond || [];

    /**
     * Subject to removal
     * @deprecated
     */
    that.hide_cond = spec.hide_cond || [];

    /**
     * Init button
     *
     * - set facet, action
     * - register event listeners
     * @param {facet.facet} facet
     */
    that.init = function(facet) {

        that.facet = facet;
        that.action = that.facet.actions.get(that.action_name);
        that.action.enabled_changed.attach(that.set_enabled);
        that.action.visible_changed.attach(that.set_visible);
    };

    /**
     * @inheritDoc
     */
    that.create = function(container) {

        that.widget_create(container);

        that.button_element = IPA.action_button({
            name: that.name,
            href: that.href,
            label: that.label,
            icon: that.icon,
            click: function() {
                that.on_click();
                return false;
            }
        }).appendTo(container);

        that.set_enabled(that.action.enabled);
        that.set_visible(that.action.visible);
    };

    /**
     * Button click handler
     *
     * Executes action by default.
     */
    that.on_click = function() {

        if (!that.enabled) return;

        that.action.execute(that.facet);
    };

    /**
     * Enabled setter
     * @param {boolean} enabled
     */
    that.set_enabled = function(enabled) {
        that.widget_set_enabled(enabled);

        if (that.button_element) {
            if (enabled) {
                that.button_element.removeClass('action-button-disabled');
            } else {
                that.button_element.addClass('action-button-disabled');
            }
        }
    };

    /**
     * Visible setter
     * @param {boolean} visible
     */
    that.set_visible = function(visible) {

        that.visible = visible;

        if (that.button_element) {
            if (visible) {
                that.button_element.show();
            } else {
                that.button_element.hide();
            }
        }
    };

    return that;
};

/**
 * Facet button bar
 *
 * @class facet.control_buttons_widget
 * @extends IPA.widget
 * @alternateClassName IPA.control_buttons_widget
 */
exp.control_buttons_widget = IPA.control_buttons_widget = function(spec) {

    spec = spec || {};

    var that = IPA.widget(spec);

    /**
     * Buttons
     * @property {Array.<facet.action_button_widget>}
     */
    that.buttons = builder.build('widget', spec.buttons, {},
                                 { $factory: exp.action_button_widget} ) || [];

    /**
     * Initializes buttons
     * @param {facet.facet} facet
     */
    that.init = function(facet) {

        var i;

        for (i=0; i<that.buttons.length; i++) {

            var button = that.buttons[i];
            button.init(facet);
        }
    };

    /**
     * @inheritDoc
     */
    that.create = function(container) {

        that.container = $('<div/>', {
            'class': that['class']
        }).appendTo(container);

        for (var i=0; i<that.buttons.length; i++) {

            var button = that.buttons[i];
            button.create(that.container);
        }
    };

    return that;
};

/**
 * Evaluate state by enable and disable condition
 *
 * @member facet
 * @return {boolean} true - all enable condition are met and none disable condition
 *                          is met
 */
exp.eval_cond = IPA.eval_cond = function(enable_cond, disable_cond, state) {

    var i, cond;

    if (disable_cond) {
        for (i=0; i<disable_cond.length; i++) {
            cond = disable_cond[i];
            if (state.indexOf(cond) > -1) {
                return false;
            }
        }
    }

    if (enable_cond) {
        for (i=0; i<enable_cond.length; i++) {
            cond = enable_cond[i];
            if (state.indexOf(cond) < 0) {
                return false;
            }
        }
    }

    return true;
};

/**
 * Action list widget to be displayed in facet header
 *
 * @class facet.action_list_widget
 * @extends IPA.composite_widget
 * @alternateClassName IPA.action_list_widget
 */
exp.action_list_widget = IPA.action_list_widget = function(spec) {

    spec = spec || {};

    spec.widgets = spec.widgets || [
        {
            $type: 'html',
            css_class: 'separator'
        },
        {
            $type: 'select',
            name: 'action',
            undo: false
        },
        {
            $type: 'button',
            name: 'apply',
            label: '@i18n:actions.apply'
        }
    ];

    var that = IPA.composite_widget(spec);

    /**
     * Names of actions, which should be later obtained from facet
     * @property {Array.<string>}
     */
    that.action_names = spec.actions || [];

    /**
     * Actions
     * @property {ordered_map}
     */
    that.actions = $.ordered_map();

    /**
     * Initializes action list
     *
     * - set facet
     * - get actions from facet
     * - init child widgets
     *
     * @param {facet.facet} facet
     */
    that.init = function(facet) {

        var options, actions, action, name, i;

        that.facet = facet;

        that.action_select = that.widgets.get_widget('action');
        that.apply_button = that.widgets.get_widget('apply');

        that.action_select.value_changed.attach(that.on_action_change);
        that.apply_button.click = that.on_apply;

        for (i=0; i<that.action_names.length; i++) {
            name = that.action_names[i];
            action = that.facet.actions.get(name);
            that.add_action(action, true);
        }

        that.init_options();
    };

    /**
     * Add action
     * @param {facet.action} action
     * @param {boolean} [batch] Set to `true` when adding multiple actions to
     *                          prevent unnecessary option initialization and
     *                          recreation. Set it back to `false` when adding
     *                          last option.
     */
    that.add_action = function(action, batch) {
        that.actions.put(action.name, action);
        action.enabled_changed.attach(that.action_enabled_changed);
        action.visible_changed.attach(that.action_visible_changed);

        if(!batch) {
            that.init_options();
            that.recreate_options();
            that.select_first_enabled();
        }
    };

    /**
     * Create and set select options from actions
     */
    that.init_options = function() {

        var options, actions, action, i;

        options = [];
        actions = that.actions.values;

        for (i=0; i< actions.length; i++) {
            action = actions[i];
            if (!action.visible) continue;
            options.push({
                label: action.label,
                value: action.name
            });
        }

        that.action_select.options = options;
    };

    /**
     * Force select to recreate options
     */
    that.recreate_options = function() {

        that.action_select.create_options();
    };

    /**
     * Handler for action selection in select
     * @protected
     */
    that.on_action_change = function() {

        var action = that.get_selected();
        that.apply_button.set_enabled(action.enabled);
    };

    /**
     * Handler for click on apply button.
     *
     * - executes selected action if enabled
     * @protected
     */
    that.on_apply = function() {

        var action = that.get_selected();

        if (action.enabled) {
            action.execute(that.facet,
                           that.on_action_success,
                           that.on_action_error);
        }
    };

    /**
     * Global action success handler
     *
     * @localdoc - override point
     * @protected
     * @abstract
     */
    that.on_action_success = function() {
    };

    /**
     * Global action error handler
     *
     * @localdoc - override point
     * @protected
     * @abstract
     */
    that.on_action_error = function() {
    };

    /**
     * Handle action's `enabled_changed` event.
     * @protected
     * @param {boolean} enabled
     */
    that.action_enabled_changed = function(enabled) {
        var action = this;
        var selected_action = that.get_selected();
        that.action_select.set_options_enabled(action.enabled, [action.name]);

        if (!action.enabled && action === selected_action) {
            that.select_first_enabled();
        }
    };

    /**
     * Handle action's `visible_changed` event.
     * @protected
     * @param {boolean} visible
     */
    that.action_visible_changed = function(visible) {
        var action = this;
        var selected_action = that.get_selected();

        that.init_options();
        that.recreate_options();

        if (!action.visible && action === selected_action) {
            that.select_first_enabled();
        }
    };

    /**
     * Get selected action
     * @return {facet.action}
     */
    that.get_selected = function() {
        var selected = that.action_select.save()[0];
        var action = that.actions.get(selected);
        return action;
    };

    /**
     * Subject to removal
     *
     * This method is full of bugs.
     *
     * @deprecated
     */
    that.get_disabled = function() {

        var disabled = [];
        var actions = that.action.values;

        for (var i=0; i< actions.length; i++) {
            var action = actions[i];
            if (!that.action.enabled) {
                disabled.push(action.name);
            }
        }

        return disabled;
    };

    /**
     * Select first enabled action
     */
    that.select_first_enabled = function() {

        var actions = that.actions.values;

        var first = actions[0].name;

        for (var i=0; i< actions.length; i++) {
            var action = actions[i];
            if (action.enabled) {
                first = action.name;
                break;
            }
        }

        that.action_select.update([first]);
    };

    /**
     * @inheritDoc
     */
    that.clear = function() {

        that.select_first_enabled();
    };

    return that;
};

/**
 * Facet state
 * @extends Stateful
 * @mixins Evented
 * @class facet.FacetState
 */
var FacetState = exp.FacetState = declare([Stateful, Evented], {

    /**
     * Properties to ignore in clear and clone operation
     */
    _ignore_properties: {_watchCallbacks:1, onset:1,_updating:1, _inherited:1},

    /**
     * Gets object containing shallow copy of state's properties.
     */
    clone: function() {
        var clone = {};
        for(var x in this){
            if (this.hasOwnProperty(x) && !(x in this._ignore_properties)) {
                clone[x] = lang.clone(this[x]);
            }
        }
        return clone;
    },

    /**
     * Unset all properties.
     */
    clear: function() {
        var undefined;
        for(var x in this){
            if (this.hasOwnProperty(x) && !(x in this._ignore_properties)) {
                this.set(x, undefined);
            }
        }
        return this;
    },

    /**
     * Set a property
     *
     * Sets named properties on a stateful object and notifies any watchers of
     * the property. A programmatic setter may be defined in subclasses.
     *
     * Can be called with hash of name/value pairs.
     *
     * @fires set
     */
    set: function(name, value) {

        var old_state;
        var updating = this._updating;
        if (!updating) old_state = this.clone();
        this._updating = true;
        this.inherited(arguments);
        if (!updating) {
            delete this._updating;
            var new_state = this.clone();
            this.emit('set', old_state, new_state);
        }

        return this;
    },

    /**
     * Set completely new state. Old state is cleared.
     *
     * @fires reset
     */
    reset: function(object) {
        var old_state = this.clone();
        this._updating = true;
        this.clear();
        this.set(object);
        delete this._updating;
        var new_state = this.clone();
        this.emit('set', old_state, new_state);
        return this;
    }
});

// Facet builder and registry
var registry = new Singleton_registry();
reg.set('facet', registry);
builder.set('facet', registry.builder);

/**
 * Action builder with registry
 * @member facet
 */
exp.action_builder = builder.get('action');
exp.action_builder.factory = exp.action;
reg.set('action', exp.action_builder.registry);

/**
 * State Evaluator builder and registry
 * @member facet
 */
exp.state_evaluator_builder = builder.get('state_evaluator');
exp.state_evaluator.factory = exp.action;
reg.set('state_evaluator', exp.state_evaluator.registry);

/**
 * Register widgets to global registry
 * @member facet
 */
exp.register = function() {
    var w = reg.widget;

    w.register('action_button', exp.action_button_widget);
    w.register('control_buttons', exp.control_buttons_widget);
    w.register('action_list', exp.action_list_widget);
};

phases.on('registration', exp.register);

return exp;
});
