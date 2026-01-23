import { useState } from 'react';
import { Plus, Search, Car, Database, Loader2 } from 'lucide-react';
import { Header } from '@/components/layout/header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  useVehicleMakes,
  useVehicleModels,
  useCreateVehicleMake,
  useCreateVehicleModel,
} from '@/hooks/use-master-data';
import { useToast } from '@/hooks/use-toast';
import { Badge } from '@/components/ui/badge';

export function MasterDataPage() {
  const [activeTab, setActiveTab] = useState<'makes' | 'models'>('makes');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedMakeId, setSelectedMakeId] = useState<string>('');

  // Dialog states
  const [isMakeDialogOpen, setIsMakeDialogOpen] = useState(false);
  const [isModelDialogOpen, setIsModelDialogOpen] = useState(false);
  const [newMakeName, setNewMakeName] = useState('');
  const [newModelName, setNewModelName] = useState('');

  const { toast } = useToast();

  const { data: makes, isLoading: isLoadingMakes } = useVehicleMakes();
  const { data: models, isLoading: isLoadingModels } = useVehicleModels(
    activeTab === 'models' ? selectedMakeId : null
  );

  const createMakeMutation = useCreateVehicleMake();
  const createModelMutation = useCreateVehicleModel();

  const handleCreateMake = async () => {
    if (!newMakeName.trim()) return;
    try {
      await createMakeMutation.mutateAsync(newMakeName);
      toast({ title: 'Success', description: 'Vehicle make created successfully' });
      setNewMakeName('');
      setIsMakeDialogOpen(false);
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to create vehicle make',
        variant: 'destructive',
      });
    }
  };

  const handleCreateModel = async () => {
    if (!newModelName.trim() || !selectedMakeId) return;
    try {
      await createModelMutation.mutateAsync({ name: newModelName, makeId: selectedMakeId });
      toast({ title: 'Success', description: 'Vehicle model created successfully' });
      setNewModelName('');
      setIsModelDialogOpen(false);
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to create vehicle model',
        variant: 'destructive',
      });
    }
  };

  const filteredMakes =
    makes?.filter(m => m.name.toLowerCase().includes(searchQuery.toLowerCase())) || [];

  const filteredModels =
    models?.filter(m => m.name.toLowerCase().includes(searchQuery.toLowerCase())) || [];

  return (
    <div className="flex flex-col h-full bg-slate-50/50 dark:bg-slate-950/50">
      <Header title="Master Data" description="Manage vehicle makes and models" />

      <div className="flex-1 overflow-auto p-6 space-y-6">
        {/* Tabs */}
        <div className="flex items-center justify-between border-b border-border">
          <div className="flex gap-2">
            <button
              onClick={() => setActiveTab('makes')}
              className={`px-4 py-2 font-medium text-sm transition-colors border-b-2 ${
                activeTab === 'makes'
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              Vehicle Makes
            </button>
            <button
              onClick={() => setActiveTab('models')}
              className={`px-4 py-2 font-medium text-sm transition-colors border-b-2 ${
                activeTab === 'models'
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              Vehicle Models
            </button>
          </div>
        </div>

        {/* Toolbar */}
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-2 flex-1">
            <div className="relative max-w-sm w-full">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder={`Search ${activeTab}...`}
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>

            {activeTab === 'models' && (
              <div className="w-[200px]">
                <Select value={selectedMakeId} onValueChange={setSelectedMakeId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Filter by Make" />
                  </SelectTrigger>
                  <SelectContent>
                    {makes?.map(make => (
                      <SelectItem key={make.id} value={make.id}>
                        {make.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          {activeTab === 'makes' ? (
            <Dialog open={isMakeDialogOpen} onOpenChange={setIsMakeDialogOpen}>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="h-4 w-4 mr-2" />
                  Add Make
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Add Vehicle Make</DialogTitle>
                  <DialogDescription>Create a new vehicle manufacturer entry.</DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <Label>Make Name</Label>
                    <Input
                      placeholder="e.g. Toyota"
                      value={newMakeName}
                      onChange={e => setNewMakeName(e.target.value)}
                    />
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setIsMakeDialogOpen(false)}>
                    Cancel
                  </Button>
                  <Button onClick={handleCreateMake} disabled={createMakeMutation.isPending}>
                    {createMakeMutation.isPending && (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    )}
                    Create
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          ) : (
            <Dialog open={isModelDialogOpen} onOpenChange={setIsModelDialogOpen}>
              <DialogTrigger asChild>
                <Button disabled={!selectedMakeId}>
                  <Plus className="h-4 w-4 mr-2" />
                  Add Model
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Add Vehicle Model</DialogTitle>
                  <DialogDescription>
                    Create a new vehicle model for the selected make.
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <Label>Model Name</Label>
                    <Input
                      placeholder="e.g. Camry"
                      value={newModelName}
                      onChange={e => setNewModelName(e.target.value)}
                    />
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setIsModelDialogOpen(false)}>
                    Cancel
                  </Button>
                  <Button onClick={handleCreateModel} disabled={createModelMutation.isPending}>
                    {createModelMutation.isPending && (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    )}
                    Create
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          )}
        </div>

        {/* Content */}
        <div className="rounded-md border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{activeTab === 'makes' ? 'Make Name' : 'Model Name'}</TableHead>
                {activeTab === 'models' && <TableHead>Make</TableHead>}
                <TableHead className="w-[100px]">ID</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody className="bg-card">
              {activeTab === 'makes' ? (
                isLoadingMakes ? (
                  <TableRow>
                    <TableCell colSpan={2} className="h-24 text-center">
                      Loading...
                    </TableCell>
                  </TableRow>
                ) : filteredMakes.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={2} className="h-24 text-center text-muted-foreground">
                      No makes found.
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredMakes.map(make => (
                    <TableRow
                      key={make.id}
                      className="hover:bg-muted/50 cursor-pointer"
                      onClick={() => {
                        setActiveTab('models');
                        setSelectedMakeId(make.id);
                      }}
                    >
                      <TableCell className="font-medium">
                        <div className="flex items-center gap-2">
                          <Car className="h-4 w-4 text-muted-foreground" />
                          {make.name}
                        </div>
                      </TableCell>
                      <TableCell className="font-mono text-xs text-muted-foreground">
                        {make.id.slice(0, 8)}...
                      </TableCell>
                    </TableRow>
                  ))
                )
              ) : isLoadingModels ? (
                <TableRow>
                  <TableCell colSpan={3} className="h-24 text-center">
                    Loading...
                  </TableCell>
                </TableRow>
              ) : !selectedMakeId ? (
                <TableRow>
                  <TableCell colSpan={3} className="h-24 text-center text-muted-foreground">
                    Please select a make to view models.
                  </TableCell>
                </TableRow>
              ) : filteredModels.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={3} className="h-24 text-center text-muted-foreground">
                    No models found for this make.
                  </TableCell>
                </TableRow>
              ) : (
                filteredModels.map(model => (
                  <TableRow key={model.id}>
                    <TableCell className="font-medium">{model.name}</TableCell>
                    <TableCell>
                      <Badge variant="outline">
                        {makes?.find(m => m.id === selectedMakeId)?.name}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">
                      {model.id.slice(0, 8)}...
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  );
}
