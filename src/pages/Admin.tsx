// src/pages/Admin.tsx
import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { Settings, ExternalLink, Save, Trash2, Copy, Link, Users } from "lucide-react";
import {
  subscribeAllDealerConfigs,
  setDealerConfig,
  removeDealerConfig,
  setPowerbiUrl,
  generateRandomCode,
  dealerNameToSlug
} from "@/lib/firebase";
import { isDealerGroup } from "@/types/dealer";

export default function Admin() {
  const [dealerConfigs, setDealerConfigs] = useState<any>({});
  const [newDealer, setNewDealer] = useState("");
  const [selectedDealer, setSelectedDealer] = useState("");
  const [powerbiUrl, setPowerbiUrlInput] = useState("");
  const [loading, setLoading] = useState(true);

  // Dealer Group states
  const [newGroupName, setNewGroupName] = useState("");
  const [selectedDealersForGroup, setSelectedDealersForGroup] = useState<string[]>([]);

  // 订阅经销商配置数据
  useEffect(() => {
    const unsubscribe = subscribeAllDealerConfigs((data) => {
      setDealerConfigs(data);
      setLoading(false);
    });

    return unsubscribe;
  }, []);

  const addDealer = async () => {
    if (!newDealer.trim()) {
      toast.error("Please enter a dealer name");
      return;
    }
    
    const slug = dealerNameToSlug(newDealer);
    
    // 检查是否已存在
    if (dealerConfigs[slug]) {
      toast.error("Dealer with this name already exists");
      return;
    }
    
    const code = generateRandomCode();
    
    try {
      await setDealerConfig(slug, {
        name: newDealer.trim(),
        code,
        isActive: true,
        createdAt: new Date().toISOString()
      });
      
      setNewDealer("");
      toast.success(`Dealer "${newDealer}" added with code: ${code}`);
    } catch (error) {
      console.error("Failed to add dealer:", error);
      toast.error("Failed to add dealer. Please try again.");
    }
  };

  const addDealerGroup = async () => {
    if (!newGroupName.trim()) {
      toast.error("Please enter a group name");
      return;
    }

    if (selectedDealersForGroup.length === 0) {
      toast.error("Please select at least one dealer for the group");
      return;
    }

    const slug = dealerNameToSlug(newGroupName);

    if (dealerConfigs[slug]) {
      toast.error("A dealer or group with this name already exists");
      return;
    }

    const code = generateRandomCode();

    try {
      await setDealerConfig(slug, {
        name: newGroupName.trim(),
        code,
        isActive: true,
        isGroup: true,
        includedDealers: selectedDealersForGroup,
        createdAt: new Date().toISOString()
      });

      setNewGroupName("");
      setSelectedDealersForGroup([]);
      toast.success(`Dealer Group "${newGroupName}" created with code: ${code}`);
    } catch (error) {
      console.error("Failed to create dealer group:", error);
      toast.error("Failed to create dealer group. Please try again.");
    }
  };

  const toggleDealerAccess = async (dealerSlug: string) => {
    const config = dealerConfigs[dealerSlug];
    if (!config) return;

    try {
      await setDealerConfig(dealerSlug, {
        ...config,
        isActive: !config.isActive
      });
      toast.success(`${isDealerGroup(config) ? 'Group' : 'Dealer'} ${config.isActive ? 'deactivated' : 'activated'}`);
    } catch (error) {
      console.error("Failed to toggle access:", error);
      toast.error("Failed to update status. Please try again.");
    }
  };

  const regenerateCode = async (dealerSlug: string) => {
    const config = dealerConfigs[dealerSlug];
    if (!config) return;

    const newCode = generateRandomCode();
    
    try {
      await setDealerConfig(dealerSlug, {
        ...config,
        code: newCode
      });
      
      toast.success(`New code generated for ${config.name}: ${newCode}`);
    } catch (error) {
      console.error("Failed to regenerate code:", error);
      toast.error("Failed to regenerate code. Please try again.");
    }
  };

  const removeDealer = async (dealerSlug: string) => {
    const config = dealerConfigs[dealerSlug];
    if (!config) return;

    try {
      await removeDealerConfig(dealerSlug);
      toast.success(`${isDealerGroup(config) ? 'Group' : 'Dealer'} removed successfully`);
    } catch (error) {
      console.error("Failed to remove:", error);
      toast.error("Failed to remove. Please try again.");
    }
  };

  const copyDealerUrl = (dealerSlug: string) => {
    const config = dealerConfigs[dealerSlug];
    if (!config) {
      toast.error("No configuration found");
      return;
    }
    
    const baseUrl = isDealerGroup(config) ? 'dealergroup' : 'dealer';
    const url = `${window.location.origin}/${baseUrl}/${dealerSlug}-${config.code}/dashboard`;
    navigator.clipboard.writeText(url).then(() => {
      toast.success("URL copied to clipboard");
    }).catch(() => {
      toast.error("Failed to copy URL");
    });
  };

  const savePowerbiConfig = async () => {
    if (!selectedDealer) {
      toast.error("Please select a dealer");
      return;
    }
    
    if (!powerbiUrl.trim()) {
      toast.error("Please enter a PowerBI URL");
      return;
    }

    try {
      await setPowerbiUrl(selectedDealer, powerbiUrl.trim());
      toast.success("PowerBI configuration saved");
      setPowerbiUrlInput("");
      setSelectedDealer("");
    } catch (error) {
      console.error("Failed to save PowerBI config:", error);
      toast.error("Failed to save PowerBI configuration. Please try again.");
    }
  };

  const removePowerbiConfig = async (dealerSlug: string) => {
    try {
      await setPowerbiUrl(dealerSlug, "");
      toast.success("PowerBI configuration removed");
    } catch (error) {
      console.error("Failed to remove PowerBI config:", error);
      toast.error("Failed to remove PowerBI configuration. Please try again.");
    }
  };

  const dealers = Object.keys(dealerConfigs);
  const regularDealers = dealers.filter(slug => !isDealerGroup(dealerConfigs[slug]));
  const dealerGroups = dealers.filter(slug => isDealerGroup(dealerConfigs[slug]));
  const activeDealers = dealers.filter(slug => dealerConfigs[slug]?.isActive);
  const dealersWithPowerbi = dealers.filter(slug => dealerConfigs[slug]?.powerbi_url);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-slate-600">Loading admin panel...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 p-6">
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-slate-900">Admin Panel</h1>
            <p className="text-slate-600 mt-1">Manage dealer access, groups, and PowerBI configurations</p>
          </div>
          <div className="flex items-center gap-2">
            <Settings className="w-5 h-5 text-slate-500" />
            <span className="text-sm text-slate-500">System Administration</span>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="p-4">
              <div className="text-2xl font-bold text-blue-600">{regularDealers.length}</div>
              <div className="text-sm text-slate-600">Total Dealers</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="text-2xl font-bold text-orange-600">{dealerGroups.length}</div>
              <div className="text-sm text-slate-600">Dealer Groups</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="text-2xl font-bold text-green-600">{activeDealers.length}</div>
              <div className="text-sm text-slate-600">Active</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="text-2xl font-bold text-purple-600">{dealersWithPowerbi.length}</div>
              <div className="text-sm text-slate-600">PowerBI Configured</div>
            </CardContent>
          </Card>
        </div>

        <Tabs defaultValue="dealers" className="space-y-6">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="dealers">Dealer Management</TabsTrigger>
            <TabsTrigger value="groups">Dealer Groups</TabsTrigger>
            <TabsTrigger value="powerbi">PowerBI Configuration</TabsTrigger>
          </TabsList>

          {/* Dealer Management Tab */}
          <TabsContent value="dealers" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Add New Dealer</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex gap-3">
                  <Input
                    placeholder="Enter dealer name (e.g., Snowy Stock)"
                    value={newDealer}
                    onChange={(e) => setNewDealer(e.target.value)}
                    onKeyPress={(e) => e.key === "Enter" && addDealer()}
                    className="flex-1"
                  />
                  <Button onClick={addDealer}>Add Dealer</Button>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Dealer Access Control & URLs</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {regularDealers.length === 0 ? (
                    <p className="text-slate-500 text-center py-8">No dealers configured</p>
                  ) : (
                    regularDealers.map((dealerSlug) => {
                      const config = dealerConfigs[dealerSlug];
                      if (!config) return null;
                      
                      const fullUrl = `${window.location.origin}/dealer/${dealerSlug}-${config.code}/dashboard`;
                      
                      return (
                        <div key={dealerSlug} className="p-4 bg-slate-50 rounded-lg space-y-3">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                              <span className="font-medium text-lg">{config.name}</span>
                              <Badge variant={config.isActive ? "default" : "secondary"}>
                                {config.isActive ? "Active" : "Inactive"}
                              </Badge>
                              {config.powerbi_url && (
                                <Badge variant="outline" className="text-purple-600">
                                  PowerBI
                                </Badge>
                              )}
                            </div>
                            <div className="flex items-center gap-2">
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => toggleDealerAccess(dealerSlug)}
                              >
                                {config.isActive ? "Deactivate" : "Activate"}
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => removeDealer(dealerSlug)}
                                className="text-red-600 hover:text-red-700"
                              >
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            </div>
                          </div>
                          
                          <div className="space-y-2">
                            <div className="flex items-center gap-2">
                              <Label className="text-sm font-medium">Access Code:</Label>
                              <code className="bg-white px-2 py-1 rounded text-sm font-mono">{config.code}</code>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => regenerateCode(dealerSlug)}
                                className="text-xs"
                              >
                                Regenerate
                              </Button>
                            </div>
                            
                            <div className="flex items-center gap-2">
                              <Label className="text-sm font-medium">Dealer URL:</Label>
                              <div className="flex-1 flex items-center gap-2">
                                <code className="bg-white px-2 py-1 rounded text-xs font-mono flex-1 truncate">
                                  {fullUrl}
                                </code>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => copyDealerUrl(dealerSlug)}
                                  className="flex items-center gap-1"
                                >
                                  <Copy className="w-3 h-3" />
                                  Copy
                                </Button>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  asChild
                                >
                                  <a
                                    href={fullUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="flex items-center gap-1"
                                  >
                                    <Link className="w-3 h-3" />
                                    Test
                                  </a>
                                </Button>
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Dealer Groups Tab */}
          <TabsContent value="groups" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Create New Dealer Group</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label htmlFor="group-name">Group Name</Label>
                  <Input
                    id="group-name"
                    placeholder="Enter group name (e.g., Regional Group A)"
                    value={newGroupName}
                    onChange={(e) => setNewGroupName(e.target.value)}
                    className="mt-1"
                  />
                </div>

                <div>
                  <Label>Select Dealers to Include</Label>
                  <div className="mt-2 space-y-2 max-h-60 overflow-y-auto border border-slate-200 rounded-md p-3">
                    {regularDealers.length === 0 ? (
                      <p className="text-slate-500 text-sm">No dealers available. Please create dealers first.</p>
                    ) : (
                      regularDealers.map((dealerSlug) => {
                        const config = dealerConfigs[dealerSlug];
                        if (!config) return null;

                        return (
                          <div key={dealerSlug} className="flex items-center space-x-2">
                            <Checkbox
                              id={`dealer-${dealerSlug}`}
                              checked={selectedDealersForGroup.includes(dealerSlug)}
                              onCheckedChange={(checked) => {
                                if (checked) {
                                  setSelectedDealersForGroup([...selectedDealersForGroup, dealerSlug]);
                                } else {
                                  setSelectedDealersForGroup(selectedDealersForGroup.filter(s => s !== dealerSlug));
                                }
                              }}
                            />
                            <label
                              htmlFor={`dealer-${dealerSlug}`}
                              className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
                            >
                              {config.name}
                            </label>
                          </div>
                        );
                      })
                    )}
                  </div>
                  {selectedDealersForGroup.length > 0 && (
                    <p className="text-xs text-slate-500 mt-2">
                      {selectedDealersForGroup.length} dealer(s) selected
                    </p>
                  )}
                </div>

                <Button onClick={addDealerGroup} className="flex items-center gap-2">
                  <Users className="w-4 h-4" />
                  Create Dealer Group
                </Button>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Existing Dealer Groups</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {dealerGroups.length === 0 ? (
                    <p className="text-slate-500 text-center py-8">No dealer groups configured</p>
                  ) : (
                    dealerGroups.map((groupSlug) => {
                      const config = dealerConfigs[groupSlug];
                      if (!config || !isDealerGroup(config)) return null;
                      
                      const fullUrl = `${window.location.origin}/dealergroup/${groupSlug}-${config.code}/dashboard`;
                      
                      return (
                        <div key={groupSlug} className="p-4 bg-slate-50 rounded-lg space-y-3">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                              <Users className="w-5 h-5 text-orange-600" />
                              <span className="font-medium text-lg">{config.name}</span>
                              <Badge variant={config.isActive ? "default" : "secondary"}>
                                {config.isActive ? "Active" : "Inactive"}
                              </Badge>
                              <Badge variant="outline" className="text-orange-600">
                                Group ({config.includedDealers?.length || 0} dealers)
                              </Badge>
                              {config.powerbi_url && (
                                <Badge variant="outline" className="text-purple-600">
                                  PowerBI
                                </Badge>
                              )}
                            </div>
                            <div className="flex items-center gap-2">
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => toggleDealerAccess(groupSlug)}
                              >
                                {config.isActive ? "Deactivate" : "Activate"}
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => removeDealer(groupSlug)}
                                className="text-red-600 hover:text-red-700"
                              >
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            </div>
                          </div>

                          <div className="pl-8 space-y-2">
                            <div className="text-sm font-medium text-slate-700">Included Dealers:</div>
                            <div className="flex flex-wrap gap-2">
                              {config.includedDealers?.map((dealerSlug: string) => {
                                const dealerConfig = dealerConfigs[dealerSlug];
                                return (
                                  <Badge key={dealerSlug} variant="secondary">
                                    {dealerConfig?.name || dealerSlug}
                                  </Badge>
                                );
                              })}
                            </div>
                          </div>
                          
                          <div className="space-y-2">
                            <div className="flex items-center gap-2">
                              <Label className="text-sm font-medium">Access Code:</Label>
                              <code className="bg-white px-2 py-1 rounded text-sm font-mono">{config.code}</code>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => regenerateCode(groupSlug)}
                                className="text-xs"
                              >
                                Regenerate
                              </Button>
                            </div>
                            
                            <div className="flex items-center gap-2">
                              <Label className="text-sm font-medium">Group URL:</Label>
                              <div className="flex-1 flex items-center gap-2">
                                <code className="bg-white px-2 py-1 rounded text-xs font-mono flex-1 truncate">
                                  {fullUrl}
                                </code>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => copyDealerUrl(groupSlug)}
                                  className="flex items-center gap-1"
                                >
                                  <Copy className="w-3 h-3" />
                                  Copy
                                </Button>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  asChild
                                >
                                  <a
                                    href={fullUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="flex items-center gap-1"
                                  >
                                    <Link className="w-3 h-3" />
                                    Test
                                  </a>
                                </Button>
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* PowerBI Configuration Tab */}
          <TabsContent value="powerbi" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Configure PowerBI Dashboard</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="dealer-select">Select Dealer or Group</Label>
                    <select
                      id="dealer-select"
                      className="w-full mt-1 p-2 border border-slate-300 rounded-md"
                      value={selectedDealer}
                      onChange={(e) => setSelectedDealer(e.target.value)}
                    >
                      <option value="">Choose a dealer or group...</option>
                      <optgroup label="Dealers">
                        {regularDealers.filter(slug => dealerConfigs[slug]?.isActive).map((dealerSlug) => {
                          const config = dealerConfigs[dealerSlug];
                          return (
                            <option key={dealerSlug} value={dealerSlug}>
                              {config?.name || dealerSlug}
                            </option>
                          );
                        })}
                      </optgroup>
                      <optgroup label="Groups">
                        {dealerGroups.filter(slug => dealerConfigs[slug]?.isActive).map((groupSlug) => {
                          const config = dealerConfigs[groupSlug];
                          return (
                            <option key={groupSlug} value={groupSlug}>
                              {config?.name || groupSlug} (Group)
                            </option>
                          );
                        })}
                      </optgroup>
                    </select>
                  </div>
                </div>
                
                <div>
                  <Label htmlFor="powerbi-url">PowerBI Embed URL</Label>
                  <Textarea
                    id="powerbi-url"
                    placeholder="Enter PowerBI embed URL (e.g., https://app.powerbi.com/view?r=...)"
                    value={powerbiUrl}
                    onChange={(e) => setPowerbiUrlInput(e.target.value)}
                    className="mt-1"
                    rows={3}
                  />
                  <p className="text-xs text-slate-500 mt-1">
                    Tip: Use PowerBI's "Embed" feature to get the correct URL. Make sure the dashboard is publicly accessible.
                  </p>
                </div>

                <Button onClick={savePowerbiConfig} className="flex items-center gap-2">
                  <Save className="w-4 h-4" />
                  Save PowerBI Configuration
                </Button>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Current PowerBI Configurations</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {dealersWithPowerbi.length === 0 ? (
                    <p className="text-slate-500 text-center py-8">No PowerBI configurations found</p>
                  ) : (
                    dealersWithPowerbi.map((dealerSlug) => {
                      const config = dealerConfigs[dealerSlug];
                      if (!config?.powerbi_url) return null;
                      
                      return (
                        <div key={dealerSlug} className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              {isDealerGroup(config) && <Users className="w-4 h-4 text-orange-600" />}
                              <div className="font-medium">{config.name}</div>
                              {isDealerGroup(config) && (
                                <Badge variant="outline" className="text-orange-600 text-xs">
                                  Group
                                </Badge>
                              )}
                            </div>
                            <div className="text-sm text-slate-500 truncate">{config.powerbi_url}</div>
                          </div>
                          <div className="flex items-center gap-2 ml-4">
                            <Button
                              variant="outline"
                              size="sm"
                              asChild
                            >
                              <a
                                href={config.powerbi_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex items-center gap-1"
                              >
                                <ExternalLink className="w-3 h-3" />
                                Test
                              </a>
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => removePowerbiConfig(dealerSlug)}
                              className="text-red-600 hover:text-red-700"
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
