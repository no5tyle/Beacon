using Topo;
using Topo.Services;
using Microsoft.AspNetCore.Components.Web;
using Microsoft.AspNetCore.Components.WebAssembly.Hosting;
using Microsoft.AspNetCore.Components;
using System.Globalization;
using Blazored.LocalStorage;

var builder = WebAssemblyHostBuilder.CreateDefault(args);
builder.RootComponents.Add<App>("#app");
builder.RootComponents.Add<HeadOutlet>("head::after");

builder.Services.AddScoped(sp => new HttpClient { BaseAddress = new Uri(builder.HostEnvironment.BaseAddress) });
builder.Services.AddSingleton<StorageService>();
builder.Services.AddSingleton<TerrainProfileGate>();
builder.Services.AddScoped<ITerrainAPIService, TerrainAPIService>();
builder.Services.AddScoped<IMembersService, MembersService>();
builder.Services.AddScoped<ILoginService, LoginService>();
builder.Services.AddScoped<IOASService, OASService>();
builder.Services.AddScoped<IWallchartService, WallchartService>();
builder.Services.AddScoped<IApprovalsService, ApprovalsService>();
builder.Services.AddScoped<IProgressService, ProgressService>();
builder.Services.AddScoped<IInsightsService, InsightsService>();
builder.Services.AddScoped<PreloadService>();
builder.Services.AddScoped<IOASRecordingService, OASRecordingService>();
builder.Services.AddSingleton<IOASReferenceService, OASReferenceService>();


builder.Logging.ClearProviders();
builder.Services.AddSingleton<LogQueueService>();
builder.Services.AddSingleton<ILoggerProvider, TopoLoggerProvider>();

builder.Services.AddBlazoredLocalStorage();

CultureInfo cultureInfo = new CultureInfo("en-AU");
CultureInfo.DefaultThreadCurrentCulture = cultureInfo;
CultureInfo.DefaultThreadCurrentUICulture = cultureInfo;


await builder.Build().RunAsync();
