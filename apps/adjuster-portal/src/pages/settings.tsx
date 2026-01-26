import { useState, useEffect } from 'react';
import {
  User,
  Settings as SettingsIcon,
  Bell,
  Lock,
  Globe,
  Mail,
  Phone,
  Shield,
  Loader2,
} from 'lucide-react';
import { Header } from '@/components/layout/header';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { useAuthStore } from '@/stores/auth-store';
import { useToast } from '@/hooks/use-toast';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { getInitials } from '@/lib/utils';
import { useUpdateProfile, useUpdatePassword, useDeleteAccount } from '@/hooks/use-user';
import { useCurrentUser } from '@/hooks/use-auth';
import { useForm } from 'react-hook-form';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ConfirmationDialog } from '@/components/ui/confirmation-dialog';

interface ProfileFormData {
  fullName: string;
  phoneNumber: string;
  licenseNumber: string;
}

interface PasswordFormData {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
}

export function SettingsPage() {
  const { user, updateUser } = useAuthStore();
  const { data: latestUser } = useCurrentUser();
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState('profile');
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);

  useEffect(() => {
    if (latestUser) {
      updateUser(latestUser);
    }
  }, [latestUser, updateUser]);

  const updateProfileMutation = useUpdateProfile();
  const updatePasswordMutation = useUpdatePassword();

  const {
    register: registerProfile,
    handleSubmit: handleSubmitProfile,
    reset: resetProfile,
    formState: { isDirty: isProfileDirty },
  } = useForm<ProfileFormData>({
    defaultValues: {
      fullName: user?.fullName || '',
      phoneNumber: user?.phoneNumber || '',
      licenseNumber: user?.licenseNumber || '',
    },
  });

  const {
    register: registerPassword,
    handleSubmit: handleSubmitPassword,
    reset: resetPassword,
    watch: watchPassword,
    formState: { isDirty: isPasswordDirty, errors: passwordErrors },
  } = useForm<PasswordFormData>({
    defaultValues: {
      currentPassword: '',
      newPassword: '',
      confirmPassword: '',
    },
  });

  const deleteAccountMutation = useDeleteAccount();

  useEffect(() => {
    if (user) {
      resetProfile({
        fullName: user.fullName || '',
        phoneNumber: user.phoneNumber || '',
        licenseNumber: user.licenseNumber || '',
      });
    }
  }, [user, resetProfile]);

  const onUpdateProfile = async (data: ProfileFormData) => {
    try {
      await updateProfileMutation.mutateAsync(data);
      toast({
        title: 'Profile updated',
        description: 'Your profile information has been saved successfully.',
      });
    } catch (error) {
      toast({
        title: 'Update failed',
        description: 'There was an error updating your profile. Please try again.',
        variant: 'destructive',
      });
    }
  };

  const onUpdatePassword = async (data: PasswordFormData) => {
    if (data.newPassword !== data.confirmPassword) {
      toast({
        title: 'Validation Error',
        description: 'Passwords do not match.',
        variant: 'destructive',
      });
      return;
    }

    try {
      await updatePasswordMutation.mutateAsync({
        currentPassword: data.currentPassword,
        newPassword: data.newPassword,
      });
      toast({
        title: 'Password updated',
        description: 'Your password has been changed successfully.',
      });
      resetPassword();
    } catch (error: any) {
      toast({
        title: 'Update failed',
        description: error.response?.data?.message || 'There was an error updating your password.',
        variant: 'destructive',
      });
    }
  };

  const onDeleteAccount = async () => {
    try {
      await deleteAccountMutation.mutateAsync();
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to delete account. Please try again later.',
        variant: 'destructive',
      });
    } finally {
      setIsDeleteDialogOpen(false);
    }
  };

  const tabs = [
    { id: 'profile', label: 'Profile', icon: User },
    { id: 'notifications', label: 'Notifications', icon: Bell },
    { id: 'security', label: 'Security', icon: Lock },
    { id: 'preferences', label: 'Preferences', icon: Globe },
  ];

  return (
    <div className="flex flex-col h-full bg-slate-50/50 dark:bg-slate-950/50">
      <Header title="Settings" description="Manage your account settings and preferences" />

      <div className="flex-1 overflow-auto p-6">
        <div className="mx-auto space-y-8">
          {/* Horizontal Tabs */}
          <div className="flex items-center border-b border-border">
            <div className="flex gap-4">
              {tabs.map(tab => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`px-4 py-2 font-medium text-sm transition-all border-b-2 -mb-[1px] ${
                    activeTab === tab.id
                      ? 'border-primary text-primary'
                      : 'border-transparent text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          {/* Main Content */}
          <main>
            {activeTab === 'profile' && (
              <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
                <Card className="border-border/60 shadow-sm">
                  <CardHeader>
                    <CardTitle>Role & Permissions</CardTitle>
                    <CardDescription>
                      Your current access level in the organization.
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-center gap-4 p-4 rounded-xl bg-slate-50 dark:bg-slate-900 border border-border/50">
                      <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                        <Shield className="h-5 w-5 text-primary" />
                      </div>
                      <div className="flex-1">
                        <p className="font-semibold text-sm capitalize">
                          {user?.role.toLowerCase()}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Full access to assigned claims and assessment tools.
                        </p>
                      </div>
                      <Badge variant="success" className="ml-auto">
                        Active
                      </Badge>
                    </div>
                  </CardContent>
                </Card>

                <Card className="border-border/60 shadow-sm overflow-hidden">
                  <CardHeader>
                    <CardTitle className="text-xl">Personal Information</CardTitle>
                    <CardDescription>
                      Update your personal details and how others see you.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="p-6 pt-0">
                    <form onSubmit={handleSubmitProfile(onUpdateProfile)} className="space-y-6">
                      <div className="flex flex-col md:flex-row gap-6 items-start md:items-center">
                        <Avatar className="h-24 w-24 border-2 border-background shadow-md">
                          <AvatarFallback className="bg-primary/10 text-primary text-2xl font-bold">
                            {user ? getInitials(user.fullName) : 'U'}
                          </AvatarFallback>
                        </Avatar>
                        <div className="space-y-2">
                          <Button variant="outline" size="sm" type="button">
                            Change Avatar
                          </Button>
                          <p className="text-xs text-muted-foreground">
                            JPG, GIF or PNG. Max size of 800K
                          </p>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="space-y-2">
                          <Label htmlFor="fullName">Full Name</Label>
                          <Input
                            id="fullName"
                            {...registerProfile('fullName')}
                            placeholder="Your full name"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="email">Email Address</Label>
                          <div className="relative">
                            <Mail className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                            <Input id="email" className="pl-10" value={user?.email} disabled />
                          </div>
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="phoneNumber">Phone Number</Label>
                          <div className="relative">
                            <Phone className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                            <Input
                              id="phoneNumber"
                              className="pl-10"
                              {...registerProfile('phoneNumber')}
                              placeholder="+1 (555) 000-0000"
                            />
                          </div>
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="licenseNumber">License Number</Label>
                          <Input
                            id="licenseNumber"
                            {...registerProfile('licenseNumber')}
                            placeholder="LIC-12345678"
                          />
                        </div>
                      </div>

                      <div className="pt-4 border-t border-border/50 flex justify-end">
                        <Button
                          type="submit"
                          disabled={updateProfileMutation.isPending || !isProfileDirty}
                        >
                          {updateProfileMutation.isPending ? (
                            <>
                              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                              Saving...
                            </>
                          ) : (
                            <>Save</>
                          )}
                        </Button>
                      </div>
                    </form>
                  </CardContent>
                </Card>
              </div>
            )}

            {activeTab === 'notifications' && (
              <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
                <Card className="border-border/60 shadow-sm">
                  <CardHeader>
                    <CardTitle>Notification Preferences</CardTitle>
                    <CardDescription>
                      Choose how you want to be notified about activity.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    <div className="space-y-4">
                      {[
                        {
                          title: 'New Claim Assigned',
                          desc: 'Get notified when a new claim is assigned to you.',
                        },
                        {
                          title: 'Session Reminders',
                          desc: 'Receive reminders before scheduled video assessments.',
                        },
                        {
                          title: 'Analysis Complete',
                          desc: 'Notifications when AI analysis of uploaded videos is ready.',
                        },
                        {
                          title: 'Security Alerts',
                          desc: 'Important notifications about your account security.',
                        },
                      ].map((item, idx) => (
                        <div
                          key={idx}
                          className="flex items-center justify-between p-4 rounded-xl border border-border/50"
                        >
                          <div className="space-y-1">
                            <p className="text-sm font-medium">{item.title}</p>
                            <p className="text-xs text-muted-foreground">{item.desc}</p>
                          </div>
                          <Switch defaultChecked />
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              </div>
            )}

            {activeTab === 'security' && (
              <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
                <Card className="border-border/60 shadow-sm">
                  <CardHeader>
                    <CardTitle>Password</CardTitle>
                    <CardDescription>
                      Update your password to keep your account secure.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <form onSubmit={handleSubmitPassword(onUpdatePassword)} className="space-y-4">
                      <div className="space-y-2">
                        <Label htmlFor="current-password">Current Password</Label>
                        <Input
                          id="current-password"
                          type="password"
                          {...registerPassword('currentPassword', { required: true })}
                        />
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label htmlFor="new-password">New Password</Label>
                          <Input
                            id="new-password"
                            type="password"
                            {...registerPassword('newPassword', {
                              required: true,
                              minLength: 8,
                            })}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="confirm-password">Confirm New Password</Label>
                          <Input
                            id="confirm-password"
                            type="password"
                            {...registerPassword('confirmPassword', {
                              required: true,
                              validate: (val: string) => {
                                if (watchPassword('newPassword') !== val) {
                                  return 'Your passwords do not match';
                                }
                              },
                            })}
                          />
                          {passwordErrors.confirmPassword && (
                            <p className="text-xs text-destructive">
                              {passwordErrors.confirmPassword.message}
                            </p>
                          )}
                        </div>
                      </div>
                      <div className="pt-2">
                        <Button
                          type="submit"
                          disabled={updatePasswordMutation.isPending || !isPasswordDirty}
                        >
                          {updatePasswordMutation.isPending ? 'Updating...' : 'Update Password'}
                        </Button>
                      </div>
                    </form>
                  </CardContent>
                </Card>

                <Card className="border-destructive/20 shadow-sm border">
                  <CardHeader>
                    <CardTitle className="text-destructive">Danger Zone</CardTitle>
                    <CardDescription>Irreversible actions for your account.</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <Button
                      variant="outline"
                      className="text-destructive hover:bg-destructive hover:text-destructive-foreground border-destructive/20"
                      type="button"
                      onClick={() => setIsDeleteDialogOpen(true)}
                      disabled={deleteAccountMutation.isPending}
                    >
                      {deleteAccountMutation.isPending ? 'Deleting...' : 'Delete Account'}
                    </Button>
                  </CardContent>
                </Card>
              </div>
            )}

            {activeTab === 'preferences' && (
              <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
                <Card className="border-border/60 shadow-sm">
                  <CardHeader>
                    <CardTitle>System Preferences</CardTitle>
                    <CardDescription>Customize your experience in the portal.</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    <div className="space-y-2">
                      <Label htmlFor="language">Interface Language</Label>
                      <Select defaultValue="en">
                        <SelectTrigger id="language">
                          <SelectValue placeholder="Select Language" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="en">English</SelectItem>
                          <SelectItem value="ms">Malay</SelectItem>
                          <SelectItem value="ta">Tamil</SelectItem>
                          <SelectItem value="zh-CN">Chinese (Simplified)</SelectItem>
                          <SelectItem value="zh-TW">Chinese (Traditional)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="timezone">Timezone</Label>
                      <Select defaultValue="utc">
                        <SelectTrigger id="timezone">
                          <SelectValue placeholder="Select Timezone" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="utc">UTC (Universal Coordinated Time)</SelectItem>
                          <SelectItem value="est">EST (Eastern Standard Time)</SelectItem>
                          <SelectItem value="pst">PST (Pacific Standard Time)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </CardContent>
                </Card>
              </div>
            )}
          </main>
        </div>
      </div>

      <ConfirmationDialog
        open={isDeleteDialogOpen}
        onOpenChange={setIsDeleteDialogOpen}
        title="Delete Account"
        description="Are you SURE you want to delete your account? This action cannot be undone and you will lose all your data."
        confirmText="Delete Account"
        variant="destructive"
        onConfirm={onDeleteAccount}
        isLoading={deleteAccountMutation.isPending}
      />
    </div>
  );
}
