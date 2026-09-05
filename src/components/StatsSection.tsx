import { useLanguage } from "@/i18n/LanguageContext";
import { usePublicCounters } from "@/hooks/usePublicCounters";
import AnimatedCounter from "@/components/AnimatedCounter";


interface Stats {
  students: number;
  resources: number;
  schools: number;
  articles: number;
  products: number;
}

const StatsSection = () => {
  const { t } = useLanguage();
  const { counters, loading } = usePublicCounters();
  const stats: Stats = {
    students: counters.profiles,
    resources: counters.resources,
    schools: counters.partners || counters.schools,
    articles: counters.articles,
    products: counters.products,
  };

  const statsData = [
    { value: stats.students, label: t.stats.students, suffix: stats.students > 0 ? "+" : "" },
    { value: stats.products, label: "Produits", suffix: "" },
    { value: stats.articles, label: "Publications", suffix: "" },
    { value: stats.schools, label: t.stats.schools, suffix: stats.schools > 0 ? "+" : "" },
  ];

  return (
    <section className="py-5 lg:py-7 bg-primary relative overflow-hidden">
      <div className="absolute inset-0 opacity-10">
        <div
          className="absolute inset-0"
          style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23ffffff' fill-opacity='0.4'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`,
          }}
        />
      </div>

      <div className="container mx-auto px-4 relative">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {statsData.map((stat, index) => (
            <div key={index} className="text-center">
              <div className="text-2xl lg:text-3xl font-display font-bold text-primary-foreground mb-0.5">
                {loading ? (
                  <span className="inline-block w-12 h-7 bg-primary-foreground/20 rounded animate-pulse" />
                ) : (
                  <>
                    <AnimatedCounter value={stat.value} />
                    <span className="text-accent">{stat.suffix}</span>
                  </>
                )}
              </div>
              <p className="text-xs text-primary-foreground/80">{stat.label}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default StatsSection;
