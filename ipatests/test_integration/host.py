# Authors:
#   Petr Viktorin <pviktori@redhat.com>
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

"""Host class for integration testing"""

import os
import socket

from ipapython.ipaldap import IPAdmin
from ipapython import ipautil
from ipapython.ipa_log_manager import log_mgr
from ipatests.test_integration import transport
from ipatests.test_integration.util import check_config_dict_empty
from ipatests.test_integration.util import TESTHOST_PREFIX


class BaseHost(object):
    """Representation of a remote IPA host"""
    transport_class = None

    def __init__(self, domain, hostname, role, ip=None,
                 external_hostname=None):
        self.domain = domain
        self.role = str(role)

        shortname, dot, ext_domain = hostname.partition('.')
        self.shortname = shortname
        self.hostname = str(shortname + '.' + self.domain.name)
        self.external_hostname = str(external_hostname or hostname)

        self.netbios = self.domain.name.split('.')[0].upper()

        self.logger_name = '%s.%s.%s' % (
            self.__module__, type(self).__name__, shortname)
        self.log = log_mgr.get_logger(self.logger_name)

        if ip:
            self.ip = str(ip)
        else:
            if self.config.ipv6:
                # $(dig +short $M $rrtype|tail -1)
                stdout, stderr, returncode = ipautil.run(
                    ['dig', '+short', self.external_hostname, 'AAAA'])
                self.ip = stdout.splitlines()[-1].strip()
            else:
                try:
                    self.ip = socket.gethostbyname(self.external_hostname)
                except socket.gaierror:
                    self.ip = None

            if not self.ip:
                raise RuntimeError('Could not determine IP address of %s' %
                                   self.external_hostname)

        self.root_password = self.config.root_password
        self.root_ssh_key_filename = self.config.root_ssh_key_filename
        self.host_key = None
        self.ssh_port = 22

        self.env_sh_path = os.path.join(domain.config.test_dir, 'env.sh')

        self.log_collectors = []

    def __str__(self):
        template = ('<{s.__class__.__name__} {s.hostname} ({s.role})>')
        return template.format(s=self)

    def __repr__(self):
        template = ('<{s.__module__}.{s.__class__.__name__} '
                    '{s.hostname} ({s.role})>')
        return template.format(s=self)

    def add_log_collector(self, collector):
        """Register a log collector for this host"""
        self.log_collectors.append(collector)

    def remove_log_collector(self, collector):
        """Unregister a log collector"""
        self.log_collectors.remove(collector)

    @classmethod
    def from_env(cls, env, domain, hostname, role, index, domain_index):
        ip = env.get('BEAKER%s%s_IP_env%s' %
                        (role.upper(), index, domain_index), None)
        external_hostname = env.get(
            'BEAKER%s%s_env%s' % (role.upper(), index, domain_index), None)

        return cls._make_host(domain, hostname, role, ip, external_hostname)

    @staticmethod
    def _make_host(domain, hostname, role, ip, external_hostname):
        # We need to determine the type of the host, this depends on the domain
        # type, as we assume all Unix machines are in the Unix domain and
        # all Windows machine in a AD domain

        if domain.type == 'AD':
            cls = WinHost
        else:
            cls = Host

        return cls(domain, hostname, role, ip, external_hostname)

    @classmethod
    def from_dict(cls, dct, domain):
        if isinstance(dct, basestring):
            dct = {'name': dct}
        try:
            role = dct.pop('role').lower()
        except KeyError:
            role = domain.static_roles[0]

        hostname = dct.pop('name')
        if '.' not in hostname:
            hostname = '.'.join((hostname, domain.name))

        ip = dct.pop('ip', None)
        external_hostname = dct.pop('external_hostname', None)

        check_config_dict_empty(dct, 'host %s' % hostname)

        return cls._make_host(domain, hostname, role, ip, external_hostname)

    def to_dict(self):
        return {
            'name': self.hostname,
            'ip': self.ip,
            'role': self.role,
            'external_hostname': self.external_hostname,
        }

    @property
    def config(self):
        return self.domain.config

    def to_env(self, **kwargs):
        """Return environment variables specific to this host"""
        env = self.domain.to_env(**kwargs)

        index = self.domain.hosts.index(self) + 1
        domain_index = self.config.domains.index(self.domain) + 1

        role = self.role.upper()
        if self.role != 'master':
            role += str(index)

        env['MYHOSTNAME'] = self.hostname
        env['MYBEAKERHOSTNAME'] = self.external_hostname
        env['MYIP'] = self.ip

        prefix = ('' if self.role in self.domain.static_roles
                  else TESTHOST_PREFIX)
        env_suffix = '_env%s' % domain_index
        env['MYROLE'] = '%s%s%s' % (prefix, role, env_suffix)
        env['MYENV'] = str(domain_index)

        return env

    @property
    def transport(self):
        try:
            return self._transport
        except AttributeError:
            cls = self.transport_class
            if cls:
                # transport_class is None in the base class and must be
                # set in subclasses.
                # Pylint reports that calling None will fail
                self._transport = cls(self)  # pylint: disable=E1102
            else:
                raise NotImplementedError('transport class not available')
            return self._transport

    def get_file_contents(self, filename):
        """Shortcut for transport.get_file_contents"""
        return self.transport.get_file_contents(filename)

    def put_file_contents(self, filename, contents):
        """Shortcut for transport.put_file_contents"""
        self.transport.put_file_contents(filename, contents)

    def ldap_connect(self):
        """Return an LDAPClient authenticated to this host as directory manager
        """
        self.log.info('Connecting to LDAP at %s', self.external_hostname)
        ldap = IPAdmin(self.external_hostname)
        binddn = self.config.dirman_dn
        self.log.info('LDAP bind as %s' % binddn)
        ldap.do_simple_bind(binddn, self.config.dirman_password)
        return ldap

    def collect_log(self, filename):
        for collector in self.log_collectors:
            collector(self, filename)

    def run_command(self, argv, set_env=True, stdin_text=None,
                    log_stdout=True, raiseonerr=True,
                    cwd=None):
        """Run the given command on this host

        Returns a Shell instance. The command will have already run in the
        shell when this method returns, so its stdout_text, stderr_text, and
        returncode attributes will be available.

        :param argv: Command to run, as either a Popen-style list, or a string
                     containing a shell script
        :param set_env: If true, env.sh exporting configuration variables will
                        be sourced before running the command.
        :param stdin_text: If given, will be written to the command's stdin
        :param log_stdout: If false, standard output will not be logged
                           (but will still be available as cmd.stdout_text)
        :param raiseonerr: If true, an exception will be raised if the command
                           does not exit with return code 0
        :param cwd: The working directory for the command
        """
        raise NotImplementedError()


class Host(BaseHost):
    """A Unix host"""
    transport_class = transport.SSHTransport

    def run_command(self, argv, set_env=True, stdin_text=None,
                    log_stdout=True, raiseonerr=True,
                    cwd=None):
        # This will give us a Bash shell
        command = self.transport.start_shell(argv, log_stdout=log_stdout)

        # Set working directory
        if cwd is None:
            cwd = self.config.test_dir
        command.stdin.write('cd %s\n' % ipautil.shell_quote(cwd))

        # Set the environment
        if set_env:
            command.stdin.write('. %s\n' %
                                ipautil.shell_quote(self.env_sh_path))
        command.stdin.write('set -e\n')

        if isinstance(argv, basestring):
            # Run a shell command given as a string
            command.stdin.write('(')
            command.stdin.write(argv)
            command.stdin.write(')')
        else:
            # Run a command given as a popen-style list (no shell expansion)
            for arg in argv:
                command.stdin.write(ipautil.shell_quote(arg))
                command.stdin.write(' ')

        command.stdin.write(';exit\n')
        if stdin_text:
            command.stdin.write(stdin_text)
        command.stdin.flush()

        command.wait(raiseonerr=raiseonerr)
        return command


class WinHost(BaseHost):
    """
    Representation of a remote Windows host.

    This serves as a sketch class once we move from manual preparation of
    Active Directory to the automated setup.
    """

    pass
