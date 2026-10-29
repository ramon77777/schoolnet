import AttendanceFoundationPage from "@/features/attendance/components/AttendanceFoundationPage";

export default function StudentAttendance() {
  return (
    <AttendanceFoundationPage
      icon="🕒"
      eyebrow="Présences & absences"
      title="Mon assiduité"
      description="Consulte tes présences, absences et retards ainsi que l'évolution de ton assiduité scolaire."
      items={[
        {
          title: "Historique personnel",
          description:
            "Retrouver les séances auxquelles tu as été marqué présent, absent ou en retard.",
        },
        {
          title: "Indicateurs d'assiduité",
          description:
            "Visualiser clairement ton taux de présence, tes absences et tes retards.",
        },
        {
          title: "Suivi des justificatifs",
          description:
            "Consulter l'état des justificatifs liés à tes absences ou retards.",
        },
      ]}
    />
  );
}