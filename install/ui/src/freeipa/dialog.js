/*jsl:import ipa.js */
/*  Authors:
 *    Endi Sukma Dewata <edewata@redhat.com>
 *    Petr Vobornik <pvoborni@redhat.com>
 *
 * Copyright (C) 2010 Red Hat
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
       'dojo/keys',
       './builder',
       './ipa',
       './jquery',
       './phases',
       './reg',
       './text',
       './field',
       './widget'],
       function(keys, builder, IPA, $, phases, reg, text) {

/**
 * Opened dialogs
 *
 * @class
 * @singleton
 */
IPA.opened_dialogs = {

    /** Opened dialogs */
    dialogs: [],

    /** Get top dialog */
    top_dialog: function() {
        var top = null;
        if (this.dialogs.length) top = this.dialogs[this.dialogs.length - 1];
        return top;
    },

    /** Focus to dialog */
    focus_top: function() {
        var top = this.top_dialog();
        if (top) {
            top.focus_first_element();
        }
    },

    /** Add dialog */
    add_dialog: function(dialog) {
        this.dialogs.push(dialog);
    },

    /** Remove dialog */
    remove_dialog: function(dialog) {
        var index = this.dialogs.indexOf(dialog);
        if (index > -1) this.dialogs.splice(index, 1);
    }
};

/**
 * Dialog button
 * @class
 */
IPA.dialog_button = function(spec) {

    spec = spec || {};

    var that = IPA.object();

    /** @property {string} name Name */
    that.name = spec.name;
    /** @property {string} label Label */
    that.label = text.get(spec.label || spec.name);
    /** @property {Function} click Click handler */
    that.click = spec.click || click;
    /** @property {boolean} visible=true Button should be visible */
    that.visible = spec.visible !== undefined ? spec.visible : true;
    /** @property {boolean} enabled=true Button is enabled */
    that.enabled = spec.enabled !== undefined ? spec.enabled : true;
    /** @property {jQuery} element Button element */
    that.element = null;

    function click() {
    }

    /**
     * Enabled setter
     * @param {boolean} enabled
     */
    that.set_enabled = function(enabled) {

        that.enabled = enabled;

        if (that.element) {
            that.element.prop('disabled', !enabled);
        }
    };

    /**
     * Enabled getter
     * @return {boolean}
     */
    that.is_enabled = function() {
        return that.enabled;
    };

    return that;
};

/**
 * This is a base class for dialog boxes.
 * @class
 */
IPA.dialog = function(spec) {

    spec = spec || {};

    var that = IPA.object();

    /** @property {entity.entity} entity Entity */
    that.entity = IPA.get_entity(spec.entity);
    /** @property {string} name="dialog" Name */
    that.name = spec.name || 'dialog';
    /** @property {string} id ID */
    that.id = spec.id;
    /** @property {string} title Dialog title */
    that.title = text.get(spec.title);
    /** @property {number} width=500 Dialog width */
    that.width = spec.width || 500;
    /** @property {number} height Dialog height */
    that.height = spec.height;

    /**
     * Close dialog on Escape key press
     * @property {boolean} close_on_escape=true
     */
    that.close_on_escape = spec.close_on_escape !== undefined ?
                            spec.close_on_escape : true;

    // FIXME: remove facet reference
    // Purpose of facet reference is to obtain pkeys or ability to reload
    // facet. Such usage makes the code more spaghetti. It should be replaced.
    /**
     * Facet
     * @property {facet.facet}
     */
    that.facet = spec.facet;

    /** @property {IPA.widget_container} widgets Widgets */
    that.widgets = IPA.widget_container();
    /** @property {IPA.field_container} fields Fields */
    that.fields = IPA.field_container({ container: that });
    /** @property {ordered_map} buttons Buttons */
    that.buttons = $.ordered_map();
    /** @property {details.facet_policies} policies Policies */
    that.policies = IPA.facet_policies({
        container: that,
        policies: spec.policies
    });

    /** Create and add button */
    that.create_button = function(spec) {
        var factory = spec.$factory || IPA.dialog_button;
        var button = factory(spec);
        that.add_button(button);
        return button;
    };

    /**
     * Add button
     * @param {IPA.dialog_button} button
     */
    that.add_button = function(button) {
        that.buttons.put(button.name, button);
    };

    /**
     * Get button
     * @param {string} name
     */
    that.get_button = function(name) {
        return that.buttons.get(name);
    };

    /**
     * Add field
     * @param {IPA.field} field
     */
    that.field = function(field) {
        that.fields.add_field(field);
        return that;
    };

    /** Validate dialog fields */
    that.validate = function() {
        var valid = true;
        var fields = that.fields.get_fields();
        for (var i=0; i<fields.length; i++) {
            var field = fields[i];
            valid = field.validate() && field.validate_required() && valid;
        }
        return valid;
    };

    /** Get ID */
    that.get_id = function() {
        if (that.id) return that.id;
        if (that.name) return that.name;
        return null;
    };

    /**
     * Create
     * @protected
     * @return {jQuery} dom_node
     */
    that.create_dialog = function() {

        if (that.dom_node) {
            that.dom_node.empty();
        }

        that.dom_node = $('<div/>', {
            'class': 'rcue-dialog-background',
            keydown: that.on_key_down
        });

        var container_node = $('<div/>', {
            'class': 'rcue-dialog-container'
        }).appendTo(that.dom_node);

        that.dialog_node = $('<div/>', {
            'class': 'rcue-dialog',
            id: that.get_id(),
            'data-name' : that.name,
            role: 'dialog',
            tabIndex: -1 // make the div focusable
        }).appendTo(container_node);

        that.header_node = $('<header/>');
        that.create_header();
        that.header_node.appendTo(that.dialog_node);

        that.body_node = $('<div/>', {
            'class': 'rcue-dialog-body'
        });
        // for backwards compatibility
        that.container = that.body_node;
        that.create_content();
        that.body_node.appendTo(that.dialog_node);

        that.footer_node = $('<footer/>');
        that.create_footer();
        that.footer_node.appendTo(that.dialog_node);

        that.policies.post_create();
        return that.dom_node;
    };

    /**
     * Create header
     * @protected
     * @return {jQuery} header_node
     */
    that.create_header = function() {

        that.header_node.empty();
        that.title_node = $('<h1/>', {
            text: that.title
        }).appendTo(that.header_node);
        that.title_close_button = $('<a/>', {
            href: '#',
            'class': 'rcue-button-close',
            click: function() {
                that.close();
            }
        }).appendTo(that.header_node);

        return that.header_node;
    };

    /**
     * Create content
     *
     * - custom dialogs should override this method
     *
     * @protected
     * @deprecated
     * @return {jQuery} footer_node
     */
    that.create_content = function() {

        that.body_node.empty();

        that.message_container = $('<div/>', {
            style: 'display: none',
            'class': 'dialog-message alert'
        }).appendTo(that.body_node);

        var widgets = that.widgets.get_widgets();
        for (var i=0; i<widgets.length; i++) {
            var widget = widgets[i];

            var div = $('<div/>', {
                name: widget.name,
                'class': 'dialog-section'
            }).appendTo(that.body_node);

            widget.create(div);
        }

        return that.body_node;
    };

    /**
     * Create footer
     * @protected
     * @return {jQuery} footer_node
     */
    that.create_footer = function() {

        that.footer_node.empty();

        that.buttons_node = $('<div/>', {
            'class': 'rcue-dialog-buttons'
        }).appendTo(that.footer_node);

        $("<div/>", { 'class': 'clear'}).appendTo(that.footer_node);

        that.create_button_nodes();

        return that.footer_node;
    };

    /**
     * Create buttons HTML inside `buttons_node`
     * @protected
     * @return {jQuery} buttons_node
     */
    that.create_button_nodes = function() {

        if (!that.buttons_node) return null;

        that.buttons_node.empty();

        for (var i=0; i<that.buttons.values.length; i++) {

            var button = that.buttons.values[i];
            if (!button.visible) continue;
            var ui_button = IPA.button({
                name: button.name,
                label: button.label,
                disabled: !button.enabled,
                click: button.click
            });
            ui_button.appendTo(that.buttons_node);
            button.element = ui_button;
        }
        return that.buttons_node;
    };

    /**
     * Default keyboard behavior
     *
     * - close on escape if enabled by `close_on_escape`
     * - makes sure that tabbing doesn't leave the dialog
     */
    that.on_key_down = function(event) {

        if ( that.close_on_escape && !event.isDefaultPrevented() && event.keyCode &&
            event.keyCode === keys.ESCAPE ) {
            event.preventDefault();
            that.close();
            return;
        }

        // prevent tabbing out of dialogs
        if ( event.keyCode !== keys.TAB ) {
            return;
        }

        var tabbables = that.dom_node.find(":tabbable"),
        first = tabbables.filter(":first"),
        last = tabbables.filter(":last");

        if ( ( event.target === last[0] || event.target === that.dialog_node[0] ) && !event.shiftKey ) {
            first.focus( 1 );
            event.preventDefault();
        } else if ( ( event.target === first[0] || event.target === that.dialog_node[0] ) && event.shiftKey ) {
            last.focus( 1 );
            event.preventDefault();
        }
    };

    /**
     * Show message in dialog's message container
     * @param {string} message
     */
    that.show_message = function(message) {
        that.message_container.text(message);
        that.message_container.css('display', '');
    };

    /** Hide dialog message */
    that.hide_message = function() {
        that.message_container.css('display', 'none');
    };

    /**
     * Open dialog
     * @param {jQuery} container
     */
    that.open = function() {

        that.create_dialog();
        that.reset();

        that.dom_node.appendTo(document.body);

        that.register_listeners();
        IPA.opened_dialogs.add_dialog(that);
        that.focus_first_element();
    };

    /**
     * Set focus to the first tabbable element in the content area or the first button.
     * If there are no tabbable elements, set focus on the dialog itself.
     */
    that.focus_first_element = function() {

        $(that.body_node.find(':tabbable').get().concat(
            that.buttons_node.find(':tabbable').get().concat(
                that.dom_node.get()))).eq(0).focus();
    };

    /**
     * Set jQuery dialog option
     * @protected
     * @deprecated
     * @param {string} name
     * @param {Mixed} value
     */
    that.option = function(name, value) {
        that.container.dialog('option', name, value);
    };

    /**
     * Update UI of buttons
     * @protected
     */
    that.set_buttons = function() {

        that.create_button_nodes();
    };

    /**
     * Make buttons visible
     * @param {string[]} names button names
     */
    that.display_buttons = function(names) {

        for (var i=0; i<that.buttons.values.length; i++) {
            var button = that.buttons.values[i];

            button.visible = names.indexOf(button.name) > -1;
        }
        that.set_buttons();
    };

    /**
     * Save fields' values into record object
     * @param {Object} record
     */
    that.save = function(record) {
        var fields = that.fields.get_fields();
        for (var i=0; i<fields.length; i++) {
            var field = fields[i];
            field.save(record);
        }
    };

    /**
     * Close dialog
     */
    that.close = function() {

        that.remove_listeners();

        that.dom_node.remove();
        that.dom_node = null;

        IPA.opened_dialogs.remove_dialog(that);
        IPA.opened_dialogs.focus_top();
    };

    /**
     * Reset dialog's fields
     */
    that.reset = function() {
        var fields = that.fields.get_fields();
        for (var i=0; i<fields.length; i++) {
            fields[i].reset();
        }
    };

    /**
     * Called when dialog is opened.
     *
     * - override point
     * @protected
     */
    that.register_listeners = function() {};

    /**
     * Called when dialog is closed.
     *
     * - override point
     * @protected
     */
    that.remove_listeners = function() {};

    /**
     * Create builder(s) which should build dialog's content (fields,
     * widgets...)
     * @protected
     */
    that.create_builder = function() {

        var widget_builder = IPA.widget_builder({
            widget_options: {
                entity: that.entity,
                facet: that
            }
        });
        var field_builder = IPA.field_builder({
            field_options: {
                undo: false,
                entity: that.entity,
                facet: that
            }
        });
        var section_builder = IPA.section_builder({
            container: that,
            section_factory: IPA.details_section,
            widget_builder: widget_builder,
            field_builder: field_builder
        });

        that.builder = IPA.details_builder({
            container: that,
            widget_builder: widget_builder,
            field_builder: field_builder,
            section_builder: section_builder
        });
    };

    /**
     * Initializes dialog object
     * @protected
     */
    that.init = function() {

        that.create_builder();
        that.builder.build(spec);
        that.fields.widgets_created();
        that.policies.init();
    };

    that.init();

    that.dialog_create_content = that.create_content;
    that.dialog_open = that.open;
    that.dialog_close = that.close;
    that.dialog_save = that.save;
    that.dialog_reset = that.reset;
    that.dialog_validate = that.validate;

    return that;
};

/**
 * Adder dialog
 * This dialog provides an interface for searching and selecting
 * values from the available results.
 *
 * It has two tables:
 *
 * - available, contains values to choose from
 * - selected, contains chosen values
 *
 * @class
 * @extends IPA.dialog
 * @mixins IPA.confirm_mixin
 */
IPA.adder_dialog = function(spec) {

    spec = spec || {};

    spec.name = spec.name || 'adder_dialog';

    var that = IPA.dialog(spec);

    IPA.confirm_mixin().apply(that);

    /**
     * External value can be added.
     *
     * In general external member doesn't represent any entity.
     * @property {boolean} external=undefined
     */
    that.external = spec.external;

    /** @property {number} width=600 Width */
    that.width = spec.width || 600;
    /** @property {number} height=300 Height */
    that.height = spec.height || 360;

    if (!that.entity) {
        var except = {
            expected: false,
            message:'Adder dialog created without entity.'
        };
        throw except;
    }

    var init = function() {
        that.available_table = IPA.table_widget({
            entity: that.entity,
            name: 'available',
            scrollable: true
        });

        that.selected_table = IPA.table_widget({
            entity: that.entity,
            name: 'selected',
            scrollable: true
        });

        if (spec.columns) {
            for (var i=0; i<spec.columns.length; i++) {
                that.create_column(spec.columns[i]);
            }
        }
    };

    /**
     * Get column
     * @param {string} name
     */
    that.get_column = function(name) {
        return that.available_table.get_column(name);
    };

    /** Get all columns */
    that.get_columns = function() {
        return that.available_table.get_columns();
    };

    /**
     * Add column to both tables.
     * @param {IPA.column} column
     */
    that.add_column = function(column) {
        that.available_table.add_column(column);
        that.selected_table.add_column(column);
    };

    /**
     * Replace columns in both tables
     * @param {IPA.column[]} columns New columns
     */
    that.set_columns = function(columns) {
        that.clear_columns();
        for (var i=0; i<columns.length; i++) {
            that.add_column(columns[i]);
        }
    };

    /**
     * Clear all columns in both tables.
     */
    that.clear_columns = function() {
        that.available_table.clear_columns();
        that.selected_table.clear_columns();
    };

    /**
     * Create column from spec
     * @param {Object} spec
     * @return {IPA.column}
     */
    that.create_column = function(spec) {
        spec.entity = that.entity;
        var column = IPA.column(spec);
        that.add_column(column);
        return column;
    };

    /**
     * @inheritDoc
     */
    that.create_content = function() {

        // do not call that.dialog_create_content();

        var container = $('<div/>', {
            'class': 'adder-dialog'
        }).appendTo(that.container);

        var top_panel = $('<div/>', {
            'class': 'adder-dialog-top'
        }).appendTo(container);

        $('<input/>', {
            type: 'text',
            name: 'filter',
            keyup: function(event) {
                if (event.keyCode === keys.ENTER) {
                    that.search();
                    return false;
                }
            }
        }).appendTo(top_panel);

        top_panel.append(' ');

        that.find_button = IPA.button({
            name: 'find',
            label: '@i18n:buttons.find',
            click: function() {
                that.search();
                return false;
            }
        }).appendTo(top_panel);

        top_panel.append(IPA.create_network_spinner());

        var left_panel = $('<div/>', {
            'class': 'adder-dialog-left'
        }).appendTo(container);

        var available_panel = $('<div/>', {
            name: 'available',
            'class': 'adder-dialog-available'
        }).appendTo(left_panel);

        $('<div/>', {
            html: text.get('@i18n:dialogs.available'),
            'class': 'adder-dialog-header ui-widget-header'
        }).appendTo(available_panel);

        var available_content = $('<div/>', {
            'class': 'adder-dialog-content'
        }).appendTo(available_panel);

        that.available_table.create(available_content);


        var right_panel = $('<div/>', {
            'class': 'adder-dialog-right'
        }).appendTo(container);

        var selected_panel = $('<div/>', {
            name: 'selected',
            'class': 'adder-dialog-selected'
        }).appendTo(right_panel);

        $('<div/>', {
            html: text.get('@i18n:dialogs.prospective'),
            'class': 'adder-dialog-header ui-widget-header'
        }).appendTo(selected_panel);

        var selected_content = $('<div/>', {
            'class': 'adder-dialog-content'
        }).appendTo(selected_panel);

        that.selected_table.create(selected_content);


        var buttons_panel = $('<div/>', {
            name: 'buttons',
            'class': 'adder-dialog-buttons'
        }).appendTo(container);

        var div = $('<div/>').appendTo(buttons_panel);
        IPA.button({
            name: 'add',
            label: '>>',
            click: function() {
                that.add();
                that.update_buttons();
                return false;
            }
        }).appendTo(div);

        div = $('<div/>').appendTo(buttons_panel);
        IPA.button({
            name: 'remove',
            label: '<<',
            click: function() {
                that.remove();
                that.update_buttons();
                return false;
            }
        }).appendTo(div);

        that.filter_field = $('input[name=filter]', that.container);

        if (that.external) {
            container.addClass('adder-dialog-with-external');

            var external_panel = $('<div/>', {
                name: 'external',
                'class': 'adder-dialog-external'
            }).appendTo(left_panel);

            $('<div/>', {
                html: text.get('@i18n:objects.sudorule.external'),
                'class': 'adder-dialog-header ui-widget-header'
            }).appendTo(external_panel);

            var external_content = $('<div/>', {
                'class': 'adder-dialog-content'
            }).appendTo(external_panel);

            that.external_field = $('<input/>', {
                type: 'text',
                name: 'external'
            }).appendTo(external_content);
        }

        that.search();
    };

    /** @inheritDoc */
    that.open = function(container) {

        var add_button = that.create_button({
            name: 'add',
            label: '@i18n:buttons.add',
            click: function() {
                if (!add_button.is_enabled()) return;
                that.execute();
            }
        });

        that.create_button({
            name: 'cancel',
            label: '@i18n:buttons.cancel',
            click: function() {
                that.close();
            }
        });

        that.dialog_open(container);

        that.update_buttons();
    };

    /**
     * Move selected values in 'available' table to 'selected' table
     */
    that.add = function() {
        var rows = that.available_table.remove_selected_rows();
        that.selected_table.add_rows(rows);
    };

    /**
     * Move selected values in 'selected' table to 'available' table
     */
    that.remove = function() {
        var rows = that.selected_table.remove_selected_rows();
        that.available_table.add_rows(rows);
    };

    /**
     * Update button state based on selection
     * @protected
     */
    that.update_buttons = function() {

        var values = that.selected_table.save();

        var button = that.get_button('add');
        button.set_enabled(values && values.length);
    };

    /**
     * Get value of 'available' filter
     * @return {string}
     */
    that.get_filter = function() {
        return that.filter_field.val();
    };

    /**
     * Clear rows in available table
     */
    that.clear_available_values = function() {
        that.available_table.empty();
    };

    /**
     * Clear rows in selected table
     */
    that.clear_selected_values = function() {
        that.selected_table.empty();
    };

    /**
     * Add record to available table
     * @param {Object} record
     */
    that.add_available_value = function(record) {
        that.available_table.add_record(record);
    };

    /**
     * Get values in 'selected' table
     */
    that.get_selected_values = function() {
        return that.selected_table.save();
    };

    /**
     * Operation which has to be executed after selection confirmation
     *
     * - override point
     */
    that.execute = function() {
    };

    /**
     * Confirm handler
     * @protected
     */
    that.on_confirm = function() {

        var add_button = that.get_button('add');
        if (add_button.is_enabled()) {
            that.execute();
        }
    };

    init();

    that.adder_dialog_create_content = that.create_content;

    return that;
};

/**
 * Deletion confirmation dialog
 *
 * - displays the values to be deleted.
 * @class
 * @extends IPA.dialog
 * @mixins IPA.confirm_mixin
 */
IPA.deleter_dialog =  function (spec) {

    spec = spec || {};

    spec.title = spec.title || '@i18n:buttons.remove';
    spec.name = spec.name || 'deleter_dialog';
    spec.message = spec.message || '@i18n:search.delete_confirm';
    spec.ok_label = spec.ok_label || '@i18n:buttons.remove';

    var that = IPA.confirm_dialog(spec);

    /**
     * Values to be deleted
     * @property {string[]} values
     */
    that.values = spec.values || [];

    /** Positive confirmation handler */
    that.on_ok = spec.on_ok || function() {
        that.execute();
    };

    /**
     * Add value
     * @param {string} value
     */
    that.add_value = function(value) {
        that.values.push(value);
    };

    /**
     * Replace values
     * @param {string[]} values
     */
    that.set_values = function(values) {
        that.values = values;
    };

    /** @inheritDoc */
    that.create_content = function() {

        $('<p/>', {
            'text': that.message
        }).appendTo(that.container);

        var div = $('<div/>', {
            style: 'overflow:auto; max-height: 100px'
        }).appendTo(that.container);

        var ul = $('<ul/>');
        ul.appendTo(div);

        for (var i=0; i<that.values.length; i++) {
            var value = that.values[i];
            if (value instanceof Object){
                var first = true;
                var str_value = "";
                for (var key in value){
                    if (value.hasOwnProperty(key)){
                        if (!first){
                            str_value += ',';
                        }
                        str_value += (key + ':' +value[key]);
                        first = false;
                    }
                }
                value = str_value;
            }

            $('<li/>',{
                'text': value
            }).appendTo(ul);
        }
    };

    that.deleter_dialog_create_content = that.create_content;

    return that;
};

/**
 * Message dialog
 *
 * Displays a message.
 * @class
 * @extends IPA.confirm_dialog
 */
IPA.message_dialog = function(spec) {

    spec = spec || {};

    spec.name = spec.name || 'message_dialog';

    var that = IPA.confirm_dialog(spec);

    /** @inheritDoc */
    that.open = function(container) {

        that.confirm_dialog_open(container);
        that.confirmed = true; // there are no options to confirm
    };

    that.buttons.remove('cancel');

    that.message_dialog_create_content = that.create_content;

    return that;
};

IPA.about_dialog = function(spec) {

    spec = spec || {};

    spec.name = spec.name || 'version_dialog';
    var product = 'FreeIPA';
    var version = 'Unknown';
    var msg = text.get('@i18n:dialogs.about_message', '${product}, version: ${version}');
    if (IPA.env) {
        product = IPA.env.product_name || product;
        version = IPA.env.version;
    }
    msg = msg.replace('${product}', product);
    msg = msg.replace('${version}', version);
    spec.message = spec.message || msg;
    spec.title = spec.title || text.get('@i18n:dialogs.about_title', 'About');

    var that = IPA.message_dialog(spec);

    return that;
};

/**
 * Confirmation dialog
 *
 * Presents user a proposal(message). User then decides whether he would accept or
 * decline the proposal.
 *
 * Acceptation is done by clicking on 'OK' button or hitting 'ENTER' key,
 * refusal by clicking on 'Cancel' button or hitting 'ESCAPE' key.
 *
 * @class
 * @extends IPA.dialog
 * @mixins IPA.confirm_mixin
 */
IPA.confirm_dialog = function(spec) {

    spec = spec || {};
    spec.name = spec.name || 'confirm_dialog';
    spec.title = spec.title || '@i18n:dialogs.confirmation';

    var that = IPA.dialog(spec);
    IPA.confirm_mixin().apply(that);

    /** @property {string} message Confirmation message */
    that.message = text.get(spec.message);

    /** @property {Function} on_ok OK handler */
    that.on_ok = spec.on_ok;

    /** @property {Function} on_cancel Cancel handler */
    that.on_cancel = spec.on_cancel;

    /** @property {Function} ok_label OK button label */
    that.ok_label = text.get(spec.ok_label || '@i18n:buttons.ok');

    /** @property {Function} cancel_label Cancel button label */
    that.cancel_label = text.get(spec.cancel_label || '@i18n:buttons.cancel');

    /**
     * Dialog is confirmed
     * @protected
     * @property {boolean}
     */
    that.confirmed = false;

    /**
     * Dialog can be confirmed by hitting 'ENTER' key
     * @property {boolean} confirm_on_enter=true
     */
    that.confirm_on_enter = spec.confirm_on_enter !== undefined ? spec.confirm_on_enter : true;

    /** @inheritDoc */
    that.create_content = function() {
        $('<p/>', {
            'text': that.message
        }).appendTo(that.container);
    };

    /** @inheritDoc */
    that.close = function() {

        that.dialog_close();

        if (that.confirmed) {
            if (that.on_ok) {
                that.on_ok();
            }
        } else {
            if (that.on_cancel) {
                that.on_cancel();
            }
        }
    };

    /** @inheritDoc */
    that.open = function(container) {

        that.confirmed = false;
        that.dialog_open(container);
    };

    /**
     * Confirm handler
     */
    that.on_confirm = function() {
        that.confirmed = true;
        that.close();
    };

    /** Create buttons */
    that.create_buttons = function() {

        that.create_button({
            name: 'ok',
            label: that.ok_label,
            click: function() {
                that.confirmed = true;
                that.close();
            }
        });

        that.create_button({
            name: 'cancel',
            label: that.cancel_label,
            click: function() {
                that.confirmed = false;
                that.close();
            }
        });
    };

    that.create_buttons();

    that.confirm_dialog_close = that.close;
    that.confirm_dialog_open = that.open;

    return that;
};

/**
 * Confirm mixin
 *
 * Can extend a dialog by confirmation by keyboard functionality. When applied
 * dialog can be:
 *
 * - confirmed by 'ENTER' key
 * - declined by 'ESCAPE' key
 *
 * To apply:
 *
 *      IPA.confirm_mixin().apply(dialog);
 *
 * @class
 */
IPA.confirm_mixin = function() {

    return {
        mixin: {

            /**
             * Elements (tag names) or node types which should be ignored as
             * confirmation event sources.
             */
            ignore_enter_rules: {
                src_elements: ['a', 'button'],
                src_types: ['textarea', 'select-one']
            },

            /**
             * Map of keys which are down
             * @property {Object}
             */
            keysdown: {},

            /**
             * Test if event is confirmation event
             *
             * Clears  event's keyCode in `keysdown` map
             *
             * @param {Event} event
             * @return {boolean}
             */
            test_ignore: function(event) {

                var ir = this.ignore_enter_rules,
                    t = event.target,
                    key = event.keyCode,
                    ignore = ir.src_elements.indexOf(t.tagName.toLowerCase()) > -1 ||
                             ir.src_types.indexOf(t.type) > -1 ||
                             !this.keysdown[key];
                    delete this.keysdown[key];

                return ignore;
            },

            /**
             * Registration of keyboard event handlers
             */
            register_listeners: function() {
                var self = this;
                this._on_key_up_listener = function(e) { self.on_key_up(e); };
                this._on_key_down_listener = function(e) { self._on_key_down(e); };
                var dialog_container = this.dom_node;
                dialog_container.bind('keyup', this._on_key_up_listener);
                dialog_container.bind('keydown', this._on_key_down_listener);
            },

            /**
             * Removal of registered event handlers
             */
            remove_listeners: function() {
                var dialog_container = this.dom_node;
                dialog_container.unbind('keyup', this._on_key_up_listener);
                dialog_container.unbind('keydown', this._on_key_down_listener);
            },

            /**
             * Test if confirmation happened
             * If so call dialog's `on_confirm` or `on_cancel` method.
             * @param {Event} event
             */
            on_key_up: function(event) {
                if (event.keyCode === keys.ENTER &&
                        !this.test_ignore(event) &&
                        !!this.on_confirm) {
                    event.preventDefault();
                    this.on_confirm();
                } else if (event.keyCode === keys.ESCAPE &&
                        !!this.on_cancel) {
                    event.preventDefault();
                    this.on_cancel();
                }
                delete this.keysdown[event.keyCode];
            },

            /**
             * Internal listener for saving which keys were pressed to
             * prevent reaction to event which originated in completely different
             * control.
             *
             * Example: first dialog is closed by keydown event, second is
             * therefore focused and consumes keyup event which can lead to undesired
             * behavior.
             *
             * @private
             * @param {Event} event
             */
            _on_key_down: function(event) {
                this.keysdown[event.keyCode] = true;
            }
        },

        apply: function(obj) {
            $.extend(obj, this.mixin);
        }
    };
};

/**
 * Dialog builder
 * - added as builder for 'dialog' registry
 * @ignore
 */
var dialog_builder = builder.get('dialog');
dialog_builder.factory = IPA.dialog;
reg.set('dialog', dialog_builder.registry);

return {};
});