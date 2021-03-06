# Authors:
#   Nathaniel McCallum <npmccallum@redhat.com>
#
# Copyright (C) 2013  Red Hat
# see file 'COPYING' for use and warranty information
#
# This program is free software; you can redistribute it and/or modify
# it under the terms of the GNU General Public License as published by
# the Free Software Foundation, either version 3 of the License, or
# (at your option) any later version.
#
# This program is distributed in the hope that it will be useful,
# but WITHOUT ANY WARRANTY; without even the implied warranty of
# MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
# GNU General Public License for more details.
#
# You should have received a copy of the GNU General Public License
# along with this program.  If not, see <http://www.gnu.org/licenses/>.

from ipalib.plugins.baseldap import DN, LDAPObject, LDAPCreate, LDAPDelete, LDAPUpdate, LDAPSearch, LDAPRetrieve
from ipalib import api, Int, Str, Bool, Flag, Bytes, IntEnum, StrEnum, _, ngettext
from ipalib.plugable import Registry
from ipalib.errors import PasswordMismatch, ConversionError, LastMemberError, NotFound
from ipalib.request import context
import base64
import uuid
import random
import urllib
import qrcode

__doc__ = _("""
OTP Tokens

Manage OTP tokens.

IPA supports the use of OTP tokens for multi-factor authentication. This
code enables the management of OTP tokens.

EXAMPLES:

 Add a new token:
   ipa otp-add --type=totp --owner=jdoe --desc="My soft token"

 Examine the token:
   ipa otp-show a93db710-a31a-4639-8647-f15b2c70b78a

 Change the vendor:
   ipa otp-mod a93db710-a31a-4639-8647-f15b2c70b78a --vendor="Red Hat"

 Delete a token:
   ipa otp-del a93db710-a31a-4639-8647-f15b2c70b78a
""")

register = Registry()

TOKEN_TYPES = {
    u'totp': ['ipatokentotpclockoffset', 'ipatokentotptimestep'],
    u'hotp': ['ipatokenhotpcounter']
}

# NOTE: For maximum compatibility, KEY_LENGTH % 5 == 0
KEY_LENGTH = 20

class OTPTokenKey(Bytes):
    """A binary password type specified in base32."""

    password = True

    kwargs = Bytes.kwargs + (
        ('confirm', bool, True),
    )

    def _convert_scalar(self, value, index=None):
        if isinstance(value, (tuple, list)) and len(value) == 2:
            (p1, p2) = value
            if p1 != p2:
                raise PasswordMismatch(name=self.name, index=index)
            value = p1

        if isinstance(value, unicode):
            try:
                value = base64.b32decode(value, True)
            except TypeError, e:
                raise ConversionError(name=self.name, index=index, error=str(e))

        return super(OTPTokenKey, self)._convert_scalar(value, index)

def _convert_owner(userobj, entry_attrs, options):
    if 'ipatokenowner' in entry_attrs and not options.get('raw', False):
        entry_attrs['ipatokenowner'] = map(userobj.get_primary_key_from_dn,
                                           entry_attrs['ipatokenowner'])

def _normalize_owner(userobj, entry_attrs):
    owner = entry_attrs.get('ipatokenowner', None)
    if owner is not None:
        entry_attrs['ipatokenowner'] = userobj.get_dn(owner)


@register()
class otptoken(LDAPObject):
    """
    OTP Token object.
    """
    container_dn = api.env.container_otp
    object_name = _('OTP token')
    object_name_plural = _('OTP tokens')
    object_class = ['ipatoken']
    possible_objectclasses = ['ipatokentotp', 'ipatokenhotp']
    default_attributes = [
        'ipatokenuniqueid', 'description', 'ipatokenowner',
        'ipatokendisabled', 'ipatokennotbefore', 'ipatokennotafter',
        'ipatokenvendor', 'ipatokenmodel', 'ipatokenserial'
    ]
    rdn_is_primary_key = True

    label = _('OTP Tokens')
    label_singular = _('OTP Token')

    takes_params = (
        Str('ipatokenuniqueid',
            cli_name='id',
            label=_('Unique ID'),
            default_from=lambda: unicode(uuid.uuid4()),
            autofill=True,
            primary_key=True,
            flags=('optional_create'),
        ),
        StrEnum('type?',
            label=_('Type'),
            default=u'totp',
            autofill=True,
            values=tuple(TOKEN_TYPES.keys()),
            flags=('virtual_attribute', 'no_update'),
        ),
        Str('description?',
            cli_name='desc',
            label=_('Description'),
        ),
        Str('ipatokenowner?',
            cli_name='owner',
            label=_('Owner'),
        ),
        Bool('ipatokendisabled?',
            cli_name='disabled',
            label=_('Disabled state')
        ),
        Str('ipatokennotbefore?',
            cli_name='not_before',
            label=_('Validity start'),
        ),
        Str('ipatokennotafter?',
            cli_name='not_after',
            label=_('Validity end'),
        ),
        Str('ipatokenvendor?',
            cli_name='vendor',
            label=_('Vendor'),
            default=u'FreeIPA',
            autofill=True,
        ),
        Str('ipatokenmodel?',
            cli_name='model',
            label=_('Model'),
            default_from=lambda type: type,
            autofill=True,
        ),
        Str('ipatokenserial?',
            cli_name='serial',
            label=_('Serial'),
            default_from=lambda id: id,
            autofill=True,
        ),
        OTPTokenKey('ipatokenotpkey?',
            cli_name='key',
            label=_('Key'),
            default_from=lambda: "".join(random.SystemRandom().sample(map(chr, range(256)), 10)),
            autofill=True,
            flags=('no_display', 'no_update', 'no_search'),
        ),
        StrEnum('ipatokenotpalgorithm?',
            cli_name='algo',
            label=_('Algorithm'),
            default=u'sha1',
            autofill=True,
            flags=('no_update'),
            values=(u'sha1', u'sha256', u'sha384', u'sha512'),
        ),
        IntEnum('ipatokenotpdigits?',
            cli_name='digits',
            label=_('Display length'),
            values=(6, 8),
            default=6,
            autofill=True,
            flags=('no_update'),
        ),
        Int('ipatokentotpclockoffset?',
            cli_name='offset',
            label=_('Clock offset'),
            default=0,
            autofill=True,
            flags=('no_update'),
        ),
        Int('ipatokentotptimestep?',
            cli_name='interval',
            label=_('Clock interval'),
            default=30,
            autofill=True,
            minvalue=5,
            flags=('no_update'),
        ),
        Int('ipatokenhotpcounter?',
            cli_name='counter',
            label=_('Counter'),
            default=0,
            autofill=True,
            minvalue=0,
            flags=('no_update'),
        ),
    )


@register()
class otptoken_add(LDAPCreate):
    __doc__ = _('Add a new OTP token.')
    msg_summary = _('Added OTP token "%(value)s"')

    takes_options = LDAPCreate.takes_options + (
        Flag('qrcode?', label=_('Display QR code (requires wide terminal)')),
    )

    has_output_params = LDAPCreate.has_output_params + (
        Str('uri?', label=_('URI')),
    )

    def pre_callback(self, ldap, dn, entry_attrs, attrs_list, *keys, **options):
        # Set the object class and defaults for specific token types
        entry_attrs['objectclass'] = otptoken.object_class + ['ipatoken' + options['type']]
        for ttype, tattrs in TOKEN_TYPES.items():
            if ttype != options['type']:
                for tattr in tattrs:
                    if tattr in entry_attrs:
                        del entry_attrs[tattr]

        # Resolve the user's dn
        _normalize_owner(self.api.Object.user, entry_attrs)

        # Get the issuer for the URI
        owner = entry_attrs.get('ipatokenowner', None)
        issuer = api.env.realm
        if owner is not None:
            try:
                issuer = ldap.get_entry(owner, ['krbprincipalname'])['krbprincipalname'][0]
            except (NotFound, IndexError):
                pass

        # Build the URI parameters
        args = {}
        args['issuer'] = issuer
        args['secret'] = base64.b32encode(entry_attrs['ipatokenotpkey'])
        args['digits'] = entry_attrs['ipatokenotpdigits']
        args['algorithm'] = entry_attrs['ipatokenotpalgorithm']
        if options['type'] == 'totp':
            args['period'] = entry_attrs['ipatokentotptimestep']
        elif options['type'] == 'hotp':
            args['counter'] = entry_attrs['ipatokenhotpcounter']

        # Build the URI
        label = urllib.quote(entry_attrs['ipatokenuniqueid'])
        parameters = urllib.urlencode(args)
        uri = u'otpauth://%s/%s:%s?%s' % (options['type'], issuer, label, parameters)
        setattr(context, 'uri', uri)

        return dn

    def post_callback(self, ldap, dn, entry_attrs, *keys, **options):
        entry_attrs['uri'] = getattr(context, 'uri')
        _convert_owner(self.api.Object.user, entry_attrs, options)
        return super(otptoken_add, self).post_callback(ldap, dn, entry_attrs, *keys, **options)

    def output_for_cli(self, textui, output, *args, **options):
        uri = output['result'].get('uri', None)
        rv = super(otptoken_add, self).output_for_cli(textui, output, *args, **options)

        # Print QR code to terminal if specified
        if uri and options.get('qrcode', False):
            print "\n"
            qr = qrcode.QRCode()
            qr.add_data(uri)
            qr.make()
            qr.print_tty()
            print "\n"

        return rv


@register()
class otptoken_del(LDAPDelete):
    __doc__ = _('Delete an OTP token.')
    msg_summary = _('Deleted OTP token "%(value)s"')


@register()
class otptoken_mod(LDAPUpdate):
    __doc__ = _('Modify a OTP token.')
    msg_summary = _('Modified OTP token "%(value)s"')

    def pre_callback(self, ldap, dn, entry_attrs, attrs_list, *keys, **options):
        _normalize_owner(self.api.Object.user, entry_attrs)
        return dn

    def post_callback(self, ldap, dn, entry_attrs, *keys, **options):
        _convert_owner(self.api.Object.user, entry_attrs, options)
        return super(otptoken_mod, self).post_callback(ldap, dn, entry_attrs, *keys, **options)


@register()
class otptoken_find(LDAPSearch):
    __doc__ = _('Search for OTP token.')
    msg_summary = ngettext(
        '%(count)d OTP token matched', '%(count)d OTP tokens matched', 0
    )

    def pre_callback(self, ldap, filters, *args, **kwargs):
        # This is a hack, but there is no other way to
        # replace the objectClass when searching
        type = kwargs.get('type', '')
        if type not in TOKEN_TYPES:
            type = ''
        filters = filters.replace("(objectclass=ipatoken)",
                                  "(objectclass=ipatoken%s)" % type)

        return super(otptoken_find, self).pre_callback(ldap, filters, *args, **kwargs)

    def args_options_2_entry(self, *args, **options):
        entry = super(otptoken_find, self).args_options_2_entry(*args, **options)
        _normalize_owner(self.api.Object.user, entry)
        return entry

    def post_callback(self, ldap, entries, truncated, *args, **options):
        for entry in entries:
            _convert_owner(self.api.Object.user, entry, options)
        return super(otptoken_find, self).post_callback(ldap, entries, truncated, *args, **options)


@register()
class otptoken_show(LDAPRetrieve):
    __doc__ = _('Display information about an OTP token.')

    def post_callback(self, ldap, dn, entry_attrs, *keys, **options):
        _convert_owner(self.api.Object.user, entry_attrs, options)
        return super(otptoken_show, self).post_callback(ldap, dn, entry_attrs, *keys, **options)
